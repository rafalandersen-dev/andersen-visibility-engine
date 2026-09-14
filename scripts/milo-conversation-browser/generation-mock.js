export const listGenerationResultsFn = ({ data }) => window.generation.list(data);
export const readGenerationResultFn = ({ data }) => window.generation.read(data);
const unexpected = async () => {
  throw Error("No mutation or image request belongs to this read fixture.");
};
export const recoverGenerationResultFn = unexpected;
export const discardGenerationResultFn = unexpected;
export const getGenerationImageDownloadFn = unexpected;
export const getArticleImagePreviewFn = unexpected;
