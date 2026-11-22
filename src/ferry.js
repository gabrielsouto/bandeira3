import * as THREE from 'three';

// Estações longitudinais da popa à proa. A boca de cada estação determina o
// contorno comum do casco, da borda branca e do convés recuado.
const stations = [
  [-18, 3.8], [-16.8, 5.65], [-13.5, 6.35], [5, 6.35],
  [10.5, 5.75], [14.6, 4.05], [18.2, 1.65], [20.3, .18],
];

function shell(sections, bottomScale, topScale) {
  const outline = [
    ...sections.map(([x, w]) => [x, -w]),
    ...sections.slice().reverse().map(([x, w]) => [x, w]),
  ];
  const vertices = [], indices = [], count = outline.length;
  for (const [y, scale] of [[0, bottomScale], [1, topScale]]) {
    for (const [x, z] of outline) vertices.push(x * scale, y, z * scale);
  }
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    indices.push(i, count + i, j, j, count + i, count + j);
    if (i > 0 && i < count - 1) indices.push(count, count + i + 1, count + i, 0, i, i + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildFerry(group, body, piece) {
  const cube = new THREE.BoxGeometry();
  const box = (...args) => piece(group, cube, ...args);
  const layer = (shape, y, h, color, sx = 1, sz = 1) => piece(group, shape, 0, y, 0, sx, h, sz, color);
  const edge = shell(stations, 1, 1);
  layer(shell(stations, .86, 1), -.24, 1.45, '#173851');
  layer(edge, 1.2, .72, body);
  layer(edge, 1.92, .48, '#fff1ce', .97, .92);
  layer(edge, 2.40, .08, '#b98350', .93, .83);

  // Salão central com vidros inclinados e passadiço na extremidade da proa.
  const lounge = [[-9, 3.6], [-8.2, 4.95], [6.1, 4.95], [8.3, 3.5]];
  layer(shell(lounge, 1, .88), 2.48, 2.85, '#24495a');
  layer(shell(lounge, .90, .90), 5.33, .48, '#fff2d3');
  box(-1.5, 5.84, 0, 10, .25, 5.2, '#297991');
  for (const x of [-4.2, .55]) {
    box(x, 6.08, 0, 3.6, .42, 3.1, '#234856');
    box(x - .16, 6.34, -.32, 2.6, .12, 2.0, '#71adb7');
  }
  const bridge = [[5, 4.1], [8.5, 4.1], [11.5, 2.7]];
  layer(shell(bridge, 1, .89), 2.5, 3.5, '#285571');
  layer(shell(bridge, .87, .84), 6, .48, '#f7ead6');
  box(6.9, 6.39, 0, 1.2, .32, 5.7, body);

  // Os bancos, as boias e os guarda-corpos precisam ser legíveis do alto.
  for (const side of [-1, 1]) {
    box(-12.9, 2.95, side * 3.55, 5.4, .8, 1.35, '#edb276');
    box(-12.9, 3.55, side * 4.15, 5.4, 1.2, .42, '#fff1cd');
    box(-4, 3.45, side * 5.87, 21.8, .32, .34, '#fff2d8');
    for (const x of [-14, -6, 2, 6]) box(x, 2.97, side * 5.87, .35, .9, .35, '#ccd4c8');
    for (const x of [-6.7, -2, 3]) box(x, 3.66, side * 4.73, .36, 2.05, .42, '#e5dfbf');
  }
  const buoy = new THREE.TorusGeometry(.98, .34, 6, 16).rotateX(-Math.PI / 2);
  for (const z of [-2.5, 2.5]) {
    piece(group, buoy, -6.55, 5.99, z, 1, 1, 1, '#f56331');
    box(-6.55, 6.29, z + .93, .52, .18, .55, '#fff2d4');
    box(-6.55, 6.29, z - .93, .52, .18, .55, '#fff2d4');
  }
  // Guincho e cabeços no convés de proa.
  box(13.5, 2.82, 0, 2.3, .7, 1.55, '#354951');
  for (const z of [-1.75, 1.75]) box(12, 2.78, z, .83, .62, .83, '#394f57');
}
