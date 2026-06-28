/**
 * Canonical domain types for the Milo Growth.
 * All store entities, mock-AI generators and UI components import from here.
 */
export type Language = "Polish" | "Swedish" | "English";

export type ContentType =
  | "Landing Page"
  | "Service Page"
  | "Blog Article"
  | "Guide"
  | "FAQ Page"
  | "Comparison"
  | "Location Page";

export type SearchIntent = "Informational" | "Commercial" | "Transactional" | "Navigational";

export type Priority = "Low" | "Medium" | "High";

export type OpportunityStatus = "New" | "In Brief" | "Drafting" | "Discarded" | "Linked";

export type ContentStatus = "Draft" | "In Review" | "Approved" | "Rejected" | "Exported";

export interface Project {
  id: string;
  name: string;
  websiteUrl: string;
  businessName: string;
  businessType: string;
  primaryLanguage: Language;
  additionalLanguages: Language[];
  mainLocation: string;
  targetLocations: string[];
  description: string;
  targetAudience: string;
  toneOfVoice: string;
  uniqueSellingPoints: string;
  brandNotes: string;
}

export interface ServiceItem {
  id: string;
  projectId: string;
  name: string;
  kind: "Service" | "Product";
  description: string;
  targetAudience: string;
  locationRelevance: string;
  priority: Priority;
}

export interface Opportunity {
  id: string;
  projectId: string;
  title: string;
  language: Language;
  contentType: ContentType;
  searchIntent: SearchIntent;
  targetAudience: string;
  businessValue: string;
  recommendedCta: string;
  priority: Priority;
  status: OpportunityStatus;
}

export interface CalendarItem {
  id: string;
  projectId: string;
  opportunityId?: string;
  plannedDate: string; // ISO date
  topicTitle: string;
  language: Language;
  contentType: ContentType;
  searchIntent: SearchIntent;
  recommendedCta: string;
  status: "Planned" | "In Progress" | "Done";
}

export interface ContentAsset {
  id: string;
  projectId: string;
  opportunityId?: string;
  title: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  outline: string[];
  faq: { q: string; a: string }[];
  cta: string;
  markdown: string;
  internalLinks: string[];
  schemaSuggestions: string[];
  editorNotes: string;
  status: ContentStatus;
  updatedAt: string;
}
