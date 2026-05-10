import os
import logging
from typing import List, Optional
from dotenv import load_dotenv
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from .schemas import Paper

load_dotenv()

logger = logging.getLogger(__name__)

class VectorStore:
    def __init__(self):
        # Use a local embedding model that doesn't hit any API rate limits
        # 'all-MiniLM-L6-v2' is a small, fast, and effective model for this use case
        self.embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        self.text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.papers_index_path = os.path.join(base_dir, "faiss_papers_index")
        self.summaries_index_path = os.path.join(base_dir, "faiss_summaries_index")
        
        self.papers_db: Optional[FAISS] = self._load_index(self.papers_index_path)
        self.summaries_db: Optional[FAISS] = self._load_index(self.summaries_index_path)

    def _load_index(self, folder_path: str) -> Optional[FAISS]:
        if os.path.exists(folder_path):
            try:
                # allow_dangerous_deserialization is required for loading local pickle files
                return FAISS.load_local(folder_path, self.embeddings, allow_dangerous_deserialization=True)
            except Exception as e:
                logger.error(f"Failed to load index from {folder_path}: {e}")
                # If loading fails (e.g. mismatched embeddings), we should probably start fresh or handle it.
                # For now, returning None will force creating a new index implies losing old data,
                # but better than crashing.
                return None
        return None

    def add_papers(self, papers: List[Paper]):
        texts = []
        metadatas = []
        
        for paper in papers:
            chunks = self.text_splitter.split_text(paper.summary)
            if not chunks:
                continue
            
            for i, chunk in enumerate(chunks):
                texts.append(chunk)
                metadatas.append({
                    "title": paper.title,
                    "url": paper.url, 
                    "source": paper.source,
                    "chunk_id": i
                })
            
        if not texts:
            return

        logger.info(f"Adding {len(texts)} chunks from {len(papers)} papers to vector store.")

        if self.papers_db is None:
            self.papers_db = FAISS.from_texts(texts, self.embeddings, metadatas=metadatas)
        else:
            self.papers_db.add_texts(texts, metadatas=metadatas)
            
        self.papers_db.save_local(self.papers_index_path)

    def add_summary_record(self, query: str, summary: str):
        logger.info(f"Storing summary for query: {query}")
        
        if self.summaries_db is None:
            self.summaries_db = FAISS.from_texts([summary], self.embeddings, metadatas=[{"query": query, "type": "generated_summary"}])
        else:
            self.summaries_db.add_texts([summary], metadatas=[{"query": query, "type": "generated_summary"}])
            
        self.summaries_db.save_local(self.summaries_index_path)

    def search_similar_chunks(self, query: str, n_results: int = 5) -> List[str]:
        logger.info(f"Searching similar chunks for: {query}")
        
        if self.papers_db is None:
            return []
            
        docs = self.papers_db.similarity_search(query, k=n_results)
        return [doc.page_content for doc in docs]

    def search_past_summaries(self, query: str, n_results: int = 1) -> List[str]:
        logger.info(f"Checking past summaries for: {query}")
        
        if self.summaries_db is None:
            return []

        docs = self.summaries_db.similarity_search(query, k=n_results)
        return [doc.page_content for doc in docs]
