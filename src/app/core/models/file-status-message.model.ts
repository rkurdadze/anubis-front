export interface FileStatusMessage {
  fileId: number;
  objectVersionId: number;
  status: 'INDEXED' | 'PENDING' | 'FAILED';
  message?: string;
  timestamp: number;
}
