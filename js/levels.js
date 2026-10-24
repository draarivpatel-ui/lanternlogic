'use strict';
/*
 * Lantern Logic, deterministic level data.
 * Every level is a 12 by 12 character grid. A dot is intact shell and an
 * X is a cell the visitor wants carved. Patterns are authored strings so
 * the data stays readable, deterministic, and testable without a browser.
 */
(function (root) {
  const VISITORS = [
    'ghost', 'wizard', 'vampire', 'cat', 'scarecrow', 'robot',
    'owl', 'mummy', 'skeleton', 'fox', 'fairy', 'parade'
  ];

  const LEVELS = [
    {
      id: 1,
      name: 'First Spark',
      visitor: 'ghost',
      hint: 'Two round eyes and a gentle smile',
      intro: 'A little ghost waits by the gate. Light a kind smile for it.',
      time: 90,
      rows: [
        '............',
        '............',
        '............',
        '............',
        '...XX..XX...',
        '............',
        '..X......X..',
        '...X....X...',
        '....XXXX....',
        '............',
        '............',
        '............'
      ],
      constraints: {}
    },
    {
      id: 2,
      name: 'Triangle Twins',
      visitor: 'wizard',
      hint: 'Triangle eyes over a small oval mouth',
      intro: 'A young wizard wants a clever face. Triangle eyes bring luck tonight.',
      time: 90,
      rows: [
        '............',
        '............',
        '............',
        '...X....X...',
        '..XXX..XXX..',
        '............',
        '............',
        '....XXXX....',
        '............',
        '............',
        '............',
        '............'
      ],
      constraints: {}
    },
    {
      id: 3,
      name: 'The Toothy Grin',
      visitor: 'vampire',
      hint: 'Triangle eyes and a wide toothy grin',
      intro: 'A vampire prefers a dramatic look. Keep the teeth sharp and friendly.',
      time: 80,
      rows: [
        '............',
        '............',
        '............',
        '...X....X...',
        '..XXX..XXX..',
        '............',
        '..XXXXXXXX..',
        '..X.X..X.X..',
        '...XXXXXX...',
        '............',
        '............',
        '............'
      ],
      constraints: {}
    },
    {
      id: 4,
      name: 'Mirror Manners',
      visitor: 'cat',
      hint: 'Round eyes, a little nose, and a stacked smile',
      intro: 'A cat in a costume sits on the step. Every cut mirrors to the other side.',
      time: 80,
      rows: [
        '............',
        '............',
        '............',
        '...X....X...',
        '..XXX..XXX..',
        '............',
        '.....XX.....',
        '....XXXX....',
        '...XXXXXX...',
        '............',
        '............',
        '............'
      ],
      constraints: { mirror: true }
    },
    {
      id: 5,
      name: 'Stem Watch',
      visitor: 'scarecrow',
      hint: 'Angry brows, a diamond nose, and a wide grin',
      intro: 'The scarecrow asks for a brave look. Leave the stem alone, it holds the luck.',
      time: 75,
      rows: [
        '............',
        '............',
        '..X......X..',
        '..XX....XX..',
        '............',
        '............',
        '.....XX.....',
        '............',
        '...XXXXXX...',
        '............',
        '............',
        '............'
      ],
      constraints: { stemSafe: [[1, 5], [1, 6]] }
    },
    {
      id: 6,
      name: 'Counting Cuts',
      visitor: 'robot',
      hint: 'Two square eyes and a wide open laugh',
      intro: 'A friendly robot beeps at the fence. You have very few cuts to spare.',
      time: 70,
      rows: [
        '............',
        '............',
        '............',
        '............',
        '...XX..XX...',
        '............',
        '....XXXX....',
        '...XXXXXX...',
        '....XXXX....',
        '............',
        '............',
        '............'
      ],
      constraints: { maxCarved: 20 }
    },
    {
      id: 7,
      name: 'Wise One',
      visitor: 'owl',
      hint: 'Slanted eyes with a diamond beak',
      intro: 'A patient owl watches from the branch. Slant the eyes and keep it calm.',
      time: 70,
      rows: [
        '............',
        '............',
        '..X......X..',
        '...X....X...',
        '............',
        '.....XX.....',
        '............',
        '...X....X...',
        '....XXXX....',
        '............',
        '............',
        '............'
      ],
      constraints: { mirror: true }
    },
    {
      id: 8,
      name: 'Narrow Gate',
      visitor: 'mummy',
      hint: 'Flat lids over a long grin with two teeth',
      intro: 'A mummy shuffles up the path. Long grin, steady hands, and mind the stem.',
      time: 65,
      rows: [
        '............',
        '............',
        '............',
        '............',
        '............',
        '..XXX..XXX..',
        '............',
        '..XXXXXXXX..',
        '..X..XX..X..',
        '............',
        '............',
        '............'
      ],
      constraints: { stemSafe: [[1, 5], [1, 6]], maxCarved: 19 }
    },
    {
      id: 9,
      name: 'The Grim Grin',
      visitor: 'skeleton',
      hint: 'Heavy brows and a huge toothy grin',
      intro: 'A skeleton grins at the moon. Big brows, big teeth, and mirror every cut.',
      time: 65,
      rows: [
        '............',
        '............',
        '............',
        '..X......X..',
        '..XX....XX..',
        '............',
        '..XXXXXXXX..',
        '..X.X..X.X..',
        '...XXXXXX...',
        '............',
        '............',
        '............'
      ],
      constraints: { mirror: true, maxCarved: 27 }
    },
    {
      id: 10,
      name: 'Whiskers',
      visitor: 'fox',
      hint: 'Triangle eyes, whisker slits, and a zigzag mouth',
      intro: 'A fox cub sniffs the pumpkins. Whiskers need a steady mirror hand.',
      time: 60,
      rows: [
        '............',
        '............',
        '............',
        '...X....X...',
        '..XXX..XXX..',
        '.....XX.....',
        '.X........X.',
        '............',
        '..X.XXXX.X..',
        '............',
        '............',
        '............'
      ],
      constraints: { mirror: true, stemSafe: [[1, 5], [1, 6]] }
    },
    {
      id: 11,
      name: 'Moonlit Money',
      visitor: 'fairy',
      hint: 'Coin eyes, a small nose, and a long grin',
      intro: 'A fairy pays in moonlight coins. Keep the stem safe and both eyes even.',
      time: 60,
      rows: [
        '............',
        '............',
        '............',
        '............',
        '...XX..XX...',
        '...XX..XX...',
        '............',
        '.....XX.....',
        '..XXXXXXXX..',
        '............',
        '............',
        '............'
      ],
      constraints: { mirror: true, stemSafe: [[1, 5], [1, 6]] }
    },
    {
      id: 12,
      name: 'The Great Lantern',
      visitor: 'parade',
      hint: 'Star tipped eyes over a grand toothy grin',
      intro: 'The whole parade arrives at once. This is the lantern they will remember.',
      time: 55,
      rows: [
        '............',
        '............',
        '............',
        '....X..X....',
        '...XX..XX...',
        '............',
        '..XXXXXXXX..',
        '..X.X..X.X..',
        '...XXXXXX...',
        '............',
        '............',
        '............'
      ],
      constraints: { mirror: true, stemSafe: [[1, 5], [1, 6]], maxCarved: 26 }
    }
  ];

  root.LANTERN_LEVELS = LEVELS;
  root.LANTERN_VISITORS = VISITORS;
  if (typeof module === 'object' && module.exports) {
    module.exports = { LEVELS: LEVELS, VISITORS: VISITORS };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
