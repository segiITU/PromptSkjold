import { textLayerWords } from '../../src/offscreen/pdf-text-boxes';
import { locateEverywhere } from '../../src/ocr/locate';

test('a matched word covers the entire proportional-font run, including its narrow-character prefix', () => {
  const words = textLayerWords([{ str: 'iiiiiiiiiiiiiiiiiiii secret@example.com', width: 280, transform: [20, 0, 0, 20, 100, 200] }], [1, 0, 0, -1, 0, 600], 1);
  const located = locateEverywhere(words, ['secret@example.com']);
  expect(located.found.has('secret@example.com')).toBe(true);
  expect(located.boxes).toEqual([{ x0: 90, x1: 390, y0: 370, y1: 430 }]);
  expect(words[0].box).toEqual(words[1].box);
});

test('rotated text bounds cover both transformed run endpoints and its full font height', () => {
  const words = textLayerWords([{ str: 'private secret@example.com', width: 100, transform: [0, 20, -20, 0, 200, 100] }], [2, 0, 0, -2, 0, 600], 2);
  expect(words[1].box).toEqual({ x0: 340, x1: 460, y0: 180, y1: 420 });
});

test('skewed text uses every transformed corner rather than horizontal estimates', () => {
  const words = textLayerWords([{ str: 'private@example.com', width: 100, transform: [20, 10, 5, 20, 100, 200] }], [1, 0, 0, 1, 0, 0], 1);
  const b = words[0].box;
  expect(b.x0).toBeLessThan(100 - 7.5);
  expect(b.y0).toBeLessThan(200 - 30);
  expect(b.x1).toBeGreaterThan(100 + 100 * 20 / Math.hypot(20, 10) + 7.5);
  expect(b.y1).toBeGreaterThan(200 + 100 * 10 / Math.hypot(20, 10) + 30);
});

test('invalid text geometry cannot count as successfully located', () => {
  expect(textLayerWords([{ str: 'secret@example.com', width: 100, transform: [0, 0, 0, 0, 0, 0] }], [1, 0, 0, 1, 0, 0], 1)).toEqual([]);
});

test('vertical writing covers the full height advance instead of only one glyph width', () => {
  const words = textLayerWords([{ str: 'private@example.com', width: 20, height: 100, dir: 'ttb', transform: [20, 0, 0, 20, 100, 200] }], [1, 0, 0, -1, 0, 300], 1);
  expect(words[0].box).toEqual({ x0: 70, x1: 130, y0: 90, y1: 210 });
});
