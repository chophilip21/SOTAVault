export const EMBEDDING_MODEL_ID = "MongoDB/mdbr-leaf-ir";
/** Stored paper vectors and POST /search/vector expect this length. */
export const EMBEDDING_DIM = 256;
export const EMBEDDING_NATIVE_DIM = 384;

/**
 * Instruction prefix for queries.
 * Asymmetric models (like mdbr-leaf-ir / BGE) work best when the query is prefixed
 * with an instruction telling the model what to do.
 */
export const EMBEDDING_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
