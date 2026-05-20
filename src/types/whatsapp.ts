export interface WhatsAppInstance {
  id: string;
  consultant_id: string;
  instance_name: string;
  created_at: string;
}

export type TemplateMediaType = "text" | "image" | "audio" | "document";

export interface MessageTemplate {
  id: string;
  consultant_id: string;
  name: string;
  content: string;
  media_type: TemplateMediaType;
  media_url: string | null;
  image_url: string | null;
  created_at: string;
  origin_template_id?: string | null;
  shortcut?: string | null;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface BulkSendProgress {
  total: number;
  sent: number;
  failed: number;
  inProgress: boolean;
}

export interface BulkContact {
  id: string;
  name: string;
  phone: string;
  electricity_bill_value?: number;
  source: "database" | "pasted" | "imported";
}

export interface BlockConfig {
  blockSize: 10 | 20 | 30 | 40 | 50;
  intervalMinutes: 5 | 10 | 15 | 30 | 60;
}

export interface BlockProgress {
  currentBlock: number;
  totalBlocks: number;
  sentInBlock: number;
  failedInBlock: number;
  totalSent: number;
  totalFailed: number;
  totalContacts: number;
  isPaused: boolean;
  isWaitingBetweenBlocks: boolean;
  blockCountdown: number;
  messageCountdown: number;
}
