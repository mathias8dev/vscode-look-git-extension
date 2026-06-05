import { ExplainCommitDiffUseCase } from '../../../application/usecases/commits/explain-commit-diff';
import { VscodeLanguageModelDiffExplainer } from './vscode-language-model-diff-explainer';

export const defaultExplainCommitDiff = new ExplainCommitDiffUseCase(new VscodeLanguageModelDiffExplainer());
