export type DocumentClassificationType =
  | 'INVOICE'
  | 'CONTRACT'
  | 'OFFER'
  | 'TIMESHEET'
  | 'CONTAINER_LIST'
  | 'DELIVERY_NOTE'
  | 'APPLICATION'
  | 'ID_DOCUMENT'
  | 'CUSTOMS_DECLARATION'
  | 'OTHER';

export interface StructuredLineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
}

export interface StructuredCrmExtraction {
  documentType: DocumentClassificationType;
  confidence: number;
  language: string;
  
  // Core CRM Fields
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  
  // Financial & Tracking
  documentDate?: string;
  referenceNumber?: string; // Invoice number, Order number, Container number, etc.
  totalAmount?: number;
  currency?: string;
  
  // Content & Summary
  summary: string;
  keyDetails: Record<string, any>;
  lineItems?: StructuredLineItem[];

  // Entity Linkages
  matchedEntities?: {
    employee?: { id: string; name: string; confidence: string };
    container?: { id: string; containerNumber: string };
    warehouse?: { id: string; name: string };
    hall?: { id: string; name: string };
  };
}
