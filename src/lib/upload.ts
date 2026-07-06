// Xử lý ảnh phía client rồi upload THẲNG lên Cloudflare R2 (qua pre-signed URL, KHÔNG đi qua server
// API) để giảm tải VPS 1 nhân — nhất là lúc cao điểm cuối tháng (ảnh chốt số/bill).
// Nén sang WebP với preset theo purpose: ảnh thường ưu tiên nhẹ, giấy tờ/hợp đồng giữ nét chữ.
// Đóng dấu thời gian + nhãn lên góc ảnh để chống dùng lại ảnh cũ.

const MAX_DIMENSION = 960;
const IMAGE_QUALITY = 0.56;
const OUTPUT_TYPE = 'image/webp';
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;

export const METER_PHOTO_ASPECT_RATIO = 3 / 4;

export type UploadPurpose =
	| 'meter-reading'
	| 'maintenance-request'
	| 'tenant-document'
	| 'payment-proof'
	| 'contract'
	| 'room-asset';

type CompressOptions = {
	maxDimension?: number;
	quality?: number;
	aspectRatio?: number;
};

function compressionOptionsForPurpose(purpose: UploadPurpose): CompressOptions {
	if (purpose === 'tenant-document') return { maxDimension: 1280, quality: 0.62 };
	if (purpose === 'contract') return { maxDimension: 1280, quality: 0.62 };
	if (purpose === 'meter-reading') return { maxDimension: 1080, quality: 0.58 };
	if (purpose === 'payment-proof') return { maxDimension: 1080, quality: 0.58 };
	if (purpose === 'maintenance-request') return { maxDimension: 960, quality: 0.54 };
	return { maxDimension: MAX_DIMENSION, quality: IMAGE_QUALITY };
}

function validateImageFile(file: File) {
	if (!file.type.startsWith('image/')) {
		throw new Error('Vui lòng chọn file ảnh');
	}
	if (file.size > MAX_SOURCE_BYTES) {
		throw new Error('Ảnh quá lớn. Vui lòng chọn ảnh dưới 12MB');
	}
}

function loadImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Không đọc được file ảnh'));
		};
		img.src = url;
	});
}

export async function compressImage(
	file: File,
	watermarkLabel?: string,
	options: CompressOptions = {}
): Promise<Blob> {
	validateImageFile(file);
	const img = await loadImage(file);

	const maxDimension = options.maxDimension ?? MAX_DIMENSION;
	const quality = options.quality ?? IMAGE_QUALITY;
	let sourceX = 0;
	let sourceY = 0;
	let sourceWidth = img.width;
	let sourceHeight = img.height;

	if (options.aspectRatio && options.aspectRatio > 0) {
		const sourceRatio = img.width / img.height;
		if (sourceRatio > options.aspectRatio) {
			sourceWidth = img.height * options.aspectRatio;
			sourceX = (img.width - sourceWidth) / 2;
		} else {
			sourceHeight = img.width / options.aspectRatio;
			sourceY = (img.height - sourceHeight) / 2;
		}
	}

	const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
	const width = Math.round(sourceWidth * scale);
	const height = Math.round(sourceHeight * scale);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);

	if (watermarkLabel) {
		const stamp = new Date().toLocaleString('vi-VN', { hour12: false });
		const text = `${watermarkLabel} • ${stamp}`;
		const fontSize = Math.max(14, Math.round(width / 45));
		ctx.font = `bold ${fontSize}px sans-serif`;
		const padding = fontSize * 0.6;
		const maxTextWidth = Math.max(0, width - padding * 2);
		const textWidth = Math.min(ctx.measureText(text).width, maxTextWidth);

		ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
		ctx.fillRect(
			0,
			height - fontSize - padding * 2,
			textWidth + padding * 2,
			fontSize + padding * 2
		);
		ctx.fillStyle = '#ffffff';
		ctx.textBaseline = 'middle';
		ctx.save();
		ctx.beginPath();
		ctx.rect(padding, height - fontSize - padding * 2, maxTextWidth, fontSize + padding * 2);
		ctx.clip();
		ctx.fillText(text, padding, height - (fontSize + padding * 2) / 2);
		ctx.restore();
	}

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Không nén được ảnh'))),
			OUTPUT_TYPE,
			quality
		);
	});
}

// Upload 1 blob thẳng lên R2 qua pre-signed URL. Trả về URL public của file.
export async function uploadBlobToR2(blob: Blob, purpose: UploadPurpose): Promise<string> {
	let presignRes: Response;
	try {
		presignRes = await fetch('/api/uploads/presign', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({
				purpose,
				contentType: blob.type || OUTPUT_TYPE,
				byteSize: blob.size
			})
		});
	} catch {
		throw new Error('Không kết nối được máy chủ để xin link upload');
	}

	const presign = await presignRes.json().catch(() => ({}));
	if (!presignRes.ok) throw new Error(presign.error || 'Không xin được link upload');

	let uploadUrl: URL;
	try {
		uploadUrl = new URL(presign.uploadUrl);
		if (uploadUrl.protocol !== 'https:' && uploadUrl.protocol !== 'http:') throw new Error();
	} catch {
		throw new Error('Máy chủ trả về link upload R2 không hợp lệ');
	}

	let uploadRes: Response;
	try {
		uploadRes = await fetch(uploadUrl.toString(), {
			method: 'PUT',
			headers: presign.headers || { 'Content-Type': blob.type || OUTPUT_TYPE },
			body: blob
		});
	} catch {
		throw new Error('Không kết nối được R2. Vui lòng thử lại');
	}
	if (!uploadRes.ok) throw new Error(`Upload lên R2 thất bại (${uploadRes.status})`);

	const publicUrl = presign.publicUrl || presign.url;
	try {
		return new URL(publicUrl).toString();
	} catch {
		throw new Error('Máy chủ trả về link ảnh không hợp lệ');
	}
}

export async function uploadImageToR2(
	file: File,
	purpose: UploadPurpose,
	watermarkLabel?: string,
	options: CompressOptions = {}
): Promise<string> {
	const blob = await compressImage(file, watermarkLabel, {
		...compressionOptionsForPurpose(purpose),
		...options
	});
	return uploadBlobToR2(blob, purpose);
}

// Nén (kèm watermark nếu có nhãn) rồi upload lên R2, trả về URL ảnh.
export async function uploadImage(
	file: File,
	watermarkLabel?: string,
	purpose: UploadPurpose = 'tenant-document'
): Promise<string> {
	return uploadImageToR2(file, purpose, watermarkLabel);
}

// Hợp đồng: ảnh thì nén như thường; PDF thì upload thẳng (không nén) lên R2.
export async function uploadContractFile(file: File): Promise<string> {
	if (file.type.startsWith('image/')) return uploadImage(file, undefined, 'contract');
	if (file.type !== 'application/pdf') {
		throw new Error('Chỉ chấp nhận ảnh hoặc file PDF');
	}
	if (file.size > MAX_PDF_BYTES) {
		throw new Error('File PDF vượt quá 5MB');
	}
	return uploadBlobToR2(file, 'contract');
}
