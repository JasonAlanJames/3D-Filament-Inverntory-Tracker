
export interface FilamentDetails {
  brand: string;
  materialType: string;
  color: string;
  diameter: string;
  weight: string;
  printTemp: string;
  bedTemp: string;
  barcode: string;
  price: string;
  usedStatus?: string;
  qtyInStock?: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  CAPTURING = 'CAPTURING',
  PROCESSING = 'PROCESSING',
  REVIEW = 'REVIEW',
  SELECT_STATUS = 'SELECT_STATUS',
  SYNCING = 'SYNCING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  CONFIGURING = 'CONFIGURING',
  QUERYING_AI = 'QUERYING_AI'
}

export interface AppConfig {
  spreadsheetId: string;
  sheetName: string;
}

export interface AuthState {
  accessToken: string | null;
  expiresAt: number | null;
}

export interface ProcessingState {
  status: AppStatus;
  error?: string;
  result?: FilamentDetails;
  imagePreview?: string;
  existingRowIndex?: number;
  aiResponse?: string;
}
