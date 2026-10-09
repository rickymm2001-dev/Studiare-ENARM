// La taxonomía del banco como la valida el editor, armada una sola vez para las pantallas del médico.
import { TAGGABLE_BIASES } from '@/data/usecases/labeling';
import { topicTaxonomy } from '@/demo/content';
import { taxonomyViewFrom } from './editorDraft';

export const bankTaxonomy = taxonomyViewFrom({
  branches: topicTaxonomy.branches,
  taggable: TAGGABLE_BIASES.map((bias) => bias.key),
});
