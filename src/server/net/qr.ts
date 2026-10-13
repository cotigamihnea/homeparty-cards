import QRCode from 'qrcode';

export function makeQrSvg(url: string): Promise<string> {
    return QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
}
