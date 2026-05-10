/**
 * Frontend type definitions matching the backend models.
 */

export interface Paper {
  _id: string;
  project_id: string;
  title: string;
  authors: string[];
  abstract?: string | null;
  publication_date?: string | null;
  venue?: string | null;
  pdf_url?: string | null;
  source: string;
  doi?: string | null;
  extracted_data?: Record<string, string> | null;
  full_text?: string | null;
  full_text_status?: string | null;
  created_at: string;
}

export interface Project {
  _id: string;
  name: string;
  description?: string | null;
  user_id: string;
  members: string[];
  created_at: string;
  updated_at: string;
}

export interface Note {
  _id: string;
  project_id: string;
  paper_id?: string | null;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface PaperAnnotation {
  _id: string;
  paper_id: string;
  project_id: string;
  user_id: string;
  content: string;
  quote?: string | null;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  title: string;
  project_id?: string | null;
  user_id: string;
  messages: ChatMessage[];
  total_messages: number;
  offset: number;
  limit: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export type ApiKeySourceSlug = "core" | "ieee" | "springer" | "scopus" | "serp";

export interface ApiKeySource {
  source: ApiKeySourceSlug;
  label: string;
  description: string;
  configured: boolean;
}
