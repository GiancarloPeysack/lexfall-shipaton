import { FieldId } from './types';
import { IlloName } from '../components/Illustrations';

// A category groups several word "topics" into a browsable, illustrated tile.
// Following works at the topic level (persisted in `vorto.topics`); the feed
// serves the union of followed topics across the whole corpus.
// `field` ties a category to a profession preset (Medicine/Law/Business) or
// to the general / new-words pools.
export interface Category {
  id: string;
  name: string;
  tag: string;
  field: FieldId;
  illo: IlloName;
  topics: string[];
}

export const CATEGORIES: Category[] = [
  // General-interest categories lead - this is a vocabulary app first, with an
  // optional profession focus. Literature & words come first.
  { id: 'language', name: 'Language & rhetoric', tag: 'Words, wit and literature', field: 'gen', illo: 'book',
    topics: ['Rhetoric', 'Wit & humour', 'Arts & literature', 'Academia & scholarship'] },
  { id: 'mind', name: 'Mind & character', tag: 'How people think and feel', field: 'gen', illo: 'faces',
    topics: ['Mind & character', 'Emotion'] },
  { id: 'society', name: 'Power & society', tag: 'Politics, manners, money', field: 'gen', illo: 'chat',
    topics: ['Power & politics', 'Society & manners', 'Work & money', 'Money & fortune'] },
  { id: 'ideas', name: 'Ideas & time', tag: 'Philosophy and change', field: 'gen', illo: 'clock',
    topics: ['Philosophy & ideas', 'Time & change'] },
  { id: 'nature', name: 'Nature & senses', tag: 'The world and how we sense it', field: 'gen', illo: 'leaf',
    topics: ['Nature & senses'] },
  { id: 'new', name: 'New words', tag: 'Internet culture, Gen Z & Alpha', field: 'new', illo: 'phone',
    topics: ['Internet & memes', 'Vibes & reactions', 'Dating & friendship', 'Work & money', 'Trends & aesthetics', 'Tech & society'] },
  // Optional profession focuses.
  { id: 'medicine', name: 'Medicine & health', tag: 'Clinical · OET / PLAB', field: 'med', illo: 'body',
    topics: ['Diagnosis', 'Pharmacology', 'Anatomy', 'Patient care', 'Mental health', 'Surgery', 'Public health'] },
  { id: 'law', name: 'Law & justice', tag: 'Legal · TOLES', field: 'law', illo: 'scales',
    topics: ['Litigation', 'Criminal law', 'Advocacy', 'Property', 'Contracts', 'Legislation'] },
  { id: 'business', name: 'Business & money', tag: 'Corporate & professional', field: 'biz', illo: 'briefcase',
    topics: ['Finance', 'Governance', 'Strategy', 'People & management', 'Marketing & brand', 'Negotiation'] },
];

// Profession presets shown in onboarding ("Do you have a specific profession?").
// Picking one follows that category's topics; "General" leaves the whole
// general pool (everything except slang) in the feed.
// Labels are grammatically parallel (all noun phrases) so the choice reads as one list.
export const PROFESSIONS: { id: FieldId; label: string; note: string; categoryId?: string }[] = [
  { id: 'gen', label: 'General English', note: 'Literature, ideas, science and culture. The broad advanced mix' },
  { id: 'med', label: 'Healthcare', note: 'The medical English of OET, the ward & patient care', categoryId: 'medicine' },
  { id: 'law', label: 'Law', note: 'Legal English for contracts, court & TOLES', categoryId: 'law' },
  { id: 'biz', label: 'Business', note: 'Business English for meetings, emails & deals', categoryId: 'business' },
];

const _byTopic: Record<string, Category> = {};
for (const c of CATEGORIES) for (const t of c.topics) if (!_byTopic[t]) _byTopic[t] = c;
export const categoryForTopic = (topic: string): Category | undefined => _byTopic[topic];
export const categoryById = (id: string): Category | undefined => CATEGORIES.find((c) => c.id === id);
