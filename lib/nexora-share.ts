import { Platform, Share } from 'react-native';
export async function shareText(text: string, title = 'NEXORA Maps') {
  if (Platform.OS !== 'web') { await Share.share({ message: text, title }); return 'Share sheet opened'; }
  if (navigator.share) { await navigator.share({ text, title }); return 'Share sheet opened'; }
  if (navigator.clipboard) { await navigator.clipboard.writeText(text); return 'Copied to clipboard'; }
  throw new Error('Sharing is unavailable in this browser. Coordinates remain visible to copy.');
}
export async function exportGuestData(text: string) {
  if (Platform.OS !== 'web') { await Share.share({ message: text, title: 'NEXORA local data export' }); return; }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = 'nexora-local-export.json'; link.click(); URL.revokeObjectURL(url);
}
