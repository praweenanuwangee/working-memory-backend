export const WORKING_MEMORY_GAMES = [
  { gameId: 'sea-odd-one-out', label: 'වෙනස් ඒක සොයමු', maxLevels: 2, adaptive: true, available: true },
  { gameId: 'image-matcher', label: 'පින්තූර ගළපමු', maxLevels: 3, adaptive: true, available: true },
  { gameId: 'sequence-recall', label: 'පිළිවෙල මතකය', maxLevels: 3, adaptive: true, available: true },
  { gameId: 'n-back', label: 'පෙර තිබුණේ මොකක්ද?', maxLevels: 2, adaptive: true, available: true },
  { gameId: 'color-memory', label: 'මතක අභියෝගය', maxLevels: 3, adaptive: true, available: true },
  { gameId: 'video-story', label: 'කතාව මතකද?', maxLevels: 1, adaptive: true, available: true },
  { gameId: 'memory-match', label: 'හැඩ මතකය', maxLevels: 5, adaptive: false, available: false },
  { gameId: 'instruction-follow', label: 'අවධානයෙන් බලමු', maxLevels: 5, adaptive: false, available: false },
  { gameId: 'missing-item', label: 'දැක්ක දේ මතකද?', maxLevels: 5, adaptive: false, available: false },
  { gameId: 'timed-recall', label: 'ඉක්මන් මතකය', maxLevels: 5, adaptive: false, available: false },
  { gameId: 'sorting-memory', label: 'අනුපිළිවෙල සකසන්න', maxLevels: 5, adaptive: false, available: false },
  { gameId: 'sound-sequence', label: 'ශබ්ද මතකය', maxLevels: 5, adaptive: false, available: false },
  { gameId: 'adaptive-puzzle', label: 'ගැලපෙන දේ සොයමු', maxLevels: 5, adaptive: false, available: false },
];

export const WORKING_MEMORY_GAME_MAP = new Map(
  WORKING_MEMORY_GAMES.map((game) => [game.gameId, game]),
);

export const getGameDefinition = (gameId) => WORKING_MEMORY_GAME_MAP.get(gameId) || null;