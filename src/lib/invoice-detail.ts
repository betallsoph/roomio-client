export interface InvoiceItem {
	id: string;
	name: string;
	amount: number;
	details: string | null;
}

export interface PaymentAccount {
	bankName: string;
	bankCode: string;
	accountNumber: string;
	accountName: string;
}

export interface PaymentLinkInfo {
	provider: 'payos' | 'vietqr';
	paymentAccountId?: string;
	paymentAccountName?: string;
	bankName?: string;
	bankCode?: string;
	accountNumber?: string;
	accountName?: string;
	amount?: number;
	description?: string;
	qrImageUrl?: string;
	orderCode?: number;
	paymentLinkId?: string;
	checkoutUrl?: string;
	qrCode?: string;
	status?: string;
}

export interface Invoice {
	id: string;
	roomId: string;
	roomNumber: string;
	tenantName: string;
	tenantPhone: string;
	month: string;
	rentAmount: number;
	totalAmount: number;
	dueDate: string;
	paidDate: string | null;
	status: string;
	paidAmount: number;
	paymentProofImage: string | null;
	createdAt: string;
	notes: string | null;
	items: InvoiceItem[];
	paymentAccount?: PaymentAccount | null;
	paymentProvider?: string | null;
	payosCheckoutUrl?: string | null;
	payosQrCode?: string | null;
	payosStatus?: string | null;
	room: {
		property: {
			name: string;
			shortName: string;
		};
	};
}

export function formatInvoiceCurrency(amount: number) {
	return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

export function formatInvoiceNumber(amount: number) {
	return new Intl.NumberFormat('vi-VN').format(amount);
}

export function invoiceDebtAmount(invoice: Invoice) {
	return Math.max(invoice.totalAmount - invoice.paidAmount, 0);
}

export function invoicePaymentDescription(invoiceId: string) {
	const compact = invoiceId
		.replace(/[^A-Z0-9]/gi, '')
		.slice(-9)
		.toUpperCase();
	return `RIO${compact}`.slice(0, 25);
}

export function invoiceStatusLabel(status: string) {
	switch (status) {
		case 'paid':
			return 'Đã thanh toán';
		case 'pending':
			return 'Chờ thanh toán';
		case 'overdue':
			return 'Quá hạn';
		case 'partial':
			return 'Thanh toán một phần';
		default:
			return status;
	}
}

export function invoiceStatusTagClass(status: string) {
	switch (status) {
		case 'paid':
			return 'bg-green-200 text-green-800';
		case 'pending':
			return 'bg-blue-100 text-blue-900';
		case 'overdue':
			return 'bg-red-200 text-red-800';
		case 'partial':
			return 'bg-amber-200 text-amber-900';
		default:
			return 'bg-zinc-100 text-zinc-800';
	}
}
