// Every albedo in the world, in one place. The red audit (tools/red-audit.mjs)
// scans this file and every other source file: nothing may sit in red's hue
// band except the two whitelisted entries at the bottom.

import * as THREE from 'three'

export const PAL = {
  // canyon
  limeA: '#EAD2A2',
  limeB: '#E0BC86',
  limeC: '#F1E0BE',
  limeShade: '#C9B08A',
  rockGrey: '#C4BBA6',
  gravel: '#E8DCC0',
  trail: '#F4EAD2',
  trailEdge: '#D8C59C',
  floorGrass: '#B3AA70',
  riverSand: '#E6D6B2',
  riverBed: '#8E9C80',
  plateauGrass: '#BDB077',
  maquis: '#8F9660',
  maquisDark: '#6F7C4E',
  // town
  paving: '#EDE2CB',
  pavingEdge: '#D2C4A8',
  townEarth: '#D6C193',
  stoneA: '#F2E8D3',
  stoneB: '#E9DCC2',
  stoneC: '#E2D2B4',
  stoneD: '#DCD4C6',
  roofA: '#C8773E',
  roofB: '#B98150',
  roofC: '#D0864A',
  shutterGreen: '#5C6E54',
  shutterGrey: '#77828C',
  shutterBlue: '#557A8C',
  door: '#6A5440',
  awningOchre: '#D9A441',
  awningCream: '#F0E4C8',
  // woods
  needles: '#AE8C5E',
  needlesDark: '#8C7250',
  moss: '#747A48',
  pineCanopy: '#4F6B4E',
  pineCanopyLight: '#65805A',
  pineTrunk: '#7A5A3C',
  cypress: '#3F5846',
  olive: '#8D9C7A',
  oliveTrunk: '#6E5E4A',
  // shore
  sand: '#DCCBA4',
  sandWet: '#B7A684',
  pebble: '#C6BAA2',
  duneGrass: '#9C9A68',
  cliff: '#D2C09A',
  road: '#A39D8F',
  roadEdge: '#C9BFA6',
  seaShallow: '#6FB2A8',
  seaDeep: '#2C7F8C',
  riverShallow: '#8CC2B2',
  riverDeep: '#4E8F86',
  seabedShallow: '#D2C6A0',
  seabedDeep: '#4F7C80',
  // characters
  boyShirt: '#3E6E8E',
  boyShorts: '#8A5A3B',
  boySkin: '#E2B48C',
  boyHair: '#4A3526',
  boyShoe: '#5A4A3C',
  dogCoat: '#E5D5BC',
  dogWhite: '#FAF6EE',
  dogNose: '#3A302A',
  dogEye: '#2A2420',
  ink: '#3A322C',
  wood: '#8A6A4A',
  woodLight: '#B08A60',
  towelA: '#F2D27A',
  towelB: '#EAF0EE',
  clothA: '#F4F1E8',
  clothB: '#E9D98E',
  clothC: '#B9CFD8',
  clothD: '#C9D6B4',
  hull: '#F1EDE4',
  hullStripe: '#3E7E8C',
  hullOchre: '#D2A14A',
  windowGlow: '#F2B950',
  // wildflowers: yellow, violet, white, and nothing else
  flowerYellow: '#F2D27A',
  flowerViolet: '#B7A4D0',
  flowerWhite: '#F4F1E8',
}

// The only red in the game. Collar and route line, nothing else, ever.
export const COLLAR = '#D0342C'
export const RED_WHITELIST = ['COLLAR', 'ROUTE']

const tmp = new THREE.Color()
/** Linear rgb triple for a palette hex. */
export function lin(hex: string): [number, number, number] {
  tmp.set(hex)
  return [tmp.r, tmp.g, tmp.b]
}

export function mixc(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
