'use strict';
/* First foods for a baby starting solids, as the feed form lists them (Feed → Solids), in groups. Names are saved in the log in English
   (so every phone shows them in its own language) and translated where they are shown; a food typed in is kept as typed.
   The foods that are common allergens say so. Current advice (AAP, NIAID, NHS, ASCIA) is to offer these from around 6 months, when
   solids start, one new one at a time, and then keep offering them often: that lowers the chance of a food allergy. */
const Foods = (() => {
  // [food, the allergen it is or contains]
  const GROUPS = [
    { id: 'allergens', name: N_('Key allergens'), items: [[N_('Peanut'), 'peanut'], [N_('Egg'), 'egg'], [N_('Yogurt'), 'milk'], [N_('Cheese'), 'milk'], [N_('Wheat'), 'wheat'], [N_('Soy'), 'soy'], [N_('Tree nuts'), 'nuts'], [N_('Sesame'), 'sesame'], [N_('Fish'), 'fish'], [N_('Shellfish'), 'shellfish']] },
    { id: 'grains', name: N_('Grains'), items: [[N_('Baby cereal'), ''], [N_('Oats'), ''], [N_('Rice'), ''], [N_('Pasta'), 'wheat'], [N_('Bread'), 'wheat'], [N_('Quinoa'), '']] },
    { id: 'veg', name: N_('Vegetables'), items: [[N_('Sweet potato'), ''], [N_('Carrot'), ''], [N_('Squash'), ''], [N_('Peas'), ''], [N_('Green beans'), ''], [N_('Broccoli'), ''], [N_('Potato'), ''], [N_('Spinach'), ''], [N_('Cauliflower'), ''], [N_('Zucchini'), '']] },
    { id: 'fruit', name: N_('Fruit'), items: [[N_('Banana'), ''], [N_('Avocado'), ''], [N_('Apple'), ''], [N_('Pear'), ''], [N_('Peach'), ''], [N_('Mango'), ''], [N_('Berries'), ''], [N_('Melon'), ''], [N_('Prunes'), ''], [N_('Plum'), '']] },
    { id: 'protein', name: N_('Meat, fish and beans'), items: [[N_('Chicken'), ''], [N_('Beef'), ''], [N_('Turkey'), ''], [N_('Lamb'), ''], [N_('Lentils'), ''], [N_('Beans'), ''], [N_('Chickpeas'), ''], [N_('Tofu'), 'soy']] },
  ];
  const ALL = GROUPS.flatMap(g => g.items);
  /** How much was eaten (optional). */
  const PORTIONS = [N_('A taste'), N_('A few spoons'), N_('A small bowl')];
  /** The allergen a food on the list is or contains ('peanut', 'milk' …), or ''. */
  const allergen = food => (ALL.find(([f]) => f === food) || [])[1] || '';
  /** Whether a food is on the list (otherwise it was typed in, and is shown as typed). */
  const known = food => ALL.some(([f]) => f === food);
  /** The same food however it was written ("peanut", " Peanut "). */
  const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  return { GROUPS, PORTIONS, allergen, known, same };
})();
