export const RENTAL_TYPES = ['APARTMENT', 'MOTEL', 'DORM', 'WHOLE_UNIT'] as const;
export type RentalType = (typeof RENTAL_TYPES)[number];

const RENTAL_TYPE_ALIASES: Record<string, RentalType> = {
	COLIVING: 'APARTMENT',
	SERVICED_APARTMENT: 'MOTEL'
};

export function canonicalRentalType(value: unknown): string {
	if (typeof value !== 'string') return '';
	const normalized = value.trim().toUpperCase();
	if (!normalized) return '';
	return RENTAL_TYPE_ALIASES[normalized] ?? normalized;
}

function isValidRentalType(value: string): value is RentalType {
	return (RENTAL_TYPES as readonly string[]).includes(value);
}

function resolveRentalType(type: string): RentalType {
	const canonical = canonicalRentalType(type);
	return isValidRentalType(canonical) ? canonical : 'APARTMENT';
}

export const RENTAL_TYPE_OPTIONS = [
	{
		value: 'APARTMENT',
		label: 'Share phòng chung cư / Co-living',
		lines: ['Share phòng chung cư', 'Co-living']
	},
	{
		value: 'MOTEL',
		label: 'Phòng trọ truyền thống / Căn hộ dịch vụ',
		lines: ['Phòng trọ truyền thống', 'Căn hộ dịch vụ']
	},
	{ value: 'DORM', label: 'KTX / Sleepbox', lines: ['KTX', 'Sleepbox'] },
	{
		value: 'WHOLE_UNIT',
		label: 'Căn hộ chung cư nguyên căn / Nhà nguyên căn',
		lines: ['Căn hộ chung cư nguyên căn', 'Nhà nguyên căn']
	}
] as const;

export const OPERATING_MODEL_OPTIONS = [
	{
		value: 'UNSPECIFIED',
		label: 'Chưa phân loại',
		description: 'Chưa phân loại — chọn sau cũng được'
	},
	{
		value: 'OWNED',
		label: 'Tự sở hữu',
		description: 'Nhà/đất của mình, tự vận hành cho thuê'
	},
	{
		value: 'RENT_TO_RENT',
		label: 'Thuê lại để cho thuê',
		description: 'Thuê nguyên căn/tòa rồi cho thuê lại, ăn chênh lệch'
	},
	{
		value: 'MANAGED',
		label: 'Quản lý hộ chủ nhà',
		description: 'Vận hành hộ chủ nhà, thu phí quản lý'
	}
] as const;

const RENTAL_TYPE_LABELS: Record<RentalType, string> = {
	APARTMENT: 'Share phòng chung cư / Co-living',
	MOTEL: 'Phòng trọ truyền thống / Căn hộ dịch vụ',
	DORM: 'KTX / Sleepbox',
	WHOLE_UNIT: 'Căn hộ chung cư nguyên căn / Nhà nguyên căn'
};

const RENTAL_TYPE_SHORT_LABELS: Record<RentalType, string> = {
	APARTMENT: 'Co-living',
	MOTEL: 'Trọ / CHDV',
	DORM: 'KTX / Sleepbox',
	WHOLE_UNIT: 'Nguyên căn'
};

const OPERATING_MODEL_SHORT_LABELS: Record<string, string> = {
	UNSPECIFIED: 'Chưa phân loại',
	OWNED: 'Tự sở hữu',
	RENT_TO_RENT: 'Thuê lại',
	MANAGED: 'Quản lý hộ'
};

export function parseRentalTypes(value: string | null | undefined): RentalType[] {
	const parsed = (value || 'APARTMENT')
		.split(',')
		.map((type) => canonicalRentalType(type))
		.filter((type): type is RentalType => isValidRentalType(type));
	const deduped = [...new Set(parsed)];
	return deduped.length > 0 ? deduped : ['APARTMENT'];
}

export function rentalTypeLabel(type: string): string {
	const resolved = resolveRentalType(type);
	return RENTAL_TYPE_LABELS[resolved] ?? type;
}

export function rentalTypeShortLabel(type: string): string {
	const resolved = resolveRentalType(type);
	return RENTAL_TYPE_SHORT_LABELS[resolved] ?? type;
}

export function propertyLabel(type = 'APARTMENT'): string {
	const resolved = resolveRentalType(type);
	if (resolved === 'MOTEL') return 'khu trọ';
	if (resolved === 'DORM') return 'khu KTX / sleepbox';
	if (resolved === 'WHOLE_UNIT') return 'bất động sản nguyên căn';
	return 'căn co-living';
}

export function propertyHeadingLabel(type: string): string {
	return rentalTypeShortLabel(type);
}

export function blockLabel(type = 'APARTMENT'): string {
	const resolved = resolveRentalType(type);
	if (resolved === 'MOTEL') return 'Dãy';
	if (resolved === 'DORM') return 'Phòng / khu';
	if (resolved === 'WHOLE_UNIT') return 'Cụm / dự án';
	return 'Block';
}

export function propertyNamePlaceholder(type = 'APARTMENT'): string {
	const resolved = resolveRentalType(type);
	if (resolved === 'MOTEL') return 'Ví dụ: Khu trọ An Bình';
	if (resolved === 'DORM') return 'Ví dụ: Sleepbox Cầu Giấy';
	if (resolved === 'WHOLE_UNIT') return 'Ví dụ: Căn A1205 Masteri / Nhà nguyên căn Bình Thạnh';
	return 'Ví dụ: Co-living Thảo Điền';
}

export function blockPlaceholder(type = 'APARTMENT'): string {
	const resolved = resolveRentalType(type);
	if (resolved === 'MOTEL') return 'Ví dụ: Dãy A, Dãy B, Dãy sau';
	if (resolved === 'DORM') return 'Ví dụ: Phòng nam, Phòng nữ, Khu yên tĩnh';
	if (resolved === 'WHOLE_UNIT') return 'Ví dụ: Masteri Thảo Điền, Nhà phố Quận 7';
	return 'Ví dụ: A1, A2, B1, B2';
}

export function roomCodeLabel(type: string): string {
	const resolved = resolveRentalType(type);
	if (resolved === 'MOTEL') return 'Mã phòng';
	if (resolved === 'DORM') return 'Mã giường / box';
	if (resolved === 'WHOLE_UNIT') return 'Mã căn/nhà';
	return 'Mã căn hộ';
}

export function unitNoun(type: string): string {
	const resolved = resolveRentalType(type);
	if (resolved === 'WHOLE_UNIT') return 'căn / nhà';
	return 'phòng';
}

export function isColivingPricingType(type: string): boolean {
	return resolveRentalType(type) === 'APARTMENT';
}

export function pricingGroupLabel(group: 'STANDARD' | 'COLIVING', short = false): string {
	if (group === 'STANDARD') {
		return short
			? 'Tiêu chuẩn'
			: 'Nhóm tiêu chuẩn (trọ, CHDV, KTX/Sleepbox, nguyên căn)';
	}
	return short ? 'Co-living' : 'Nhóm co-living (share phòng chung cư)';
}

export function operatingModelLabel(value: string | null | undefined, short = false): string {
	if (!value) return 'Chưa phân loại';
	const labels = short ? OPERATING_MODEL_SHORT_LABELS : Object.fromEntries(
		OPERATING_MODEL_OPTIONS.map((option) => [option.value, option.label])
	);
	return labels[value] ?? 'Chưa phân loại';
}
