const approvedTitleWords:Record<string,string>={
  MALEKA:'Maleka',POUR:'Pour',FEMME:'Femme',BOCA:'Boca',JUNIORS:'Juniors',RIVER:'River',PLATE:'Plate',
  HOMME:'Homme',BLACK:'Black',CONFIDENTIAL:'Confidential',GOLD:'Gold',SALVO:'Salvo',ELIXIR:'Elixir',
  BHARARA:'Bharara',CLUB:'Club',DE:'de',NUIT:'Nuit',SILLAGE:'Sillage',LAVIVACITE:'Lavivacite',
  INTESA:'Intesa',LATTAFA:'Lattafa',KHAMRAH:'Khamrah',ODYSSEY:'Odyssey',MANDARIN:'Mandarin',
  SKY:'Sky',PHILOS:'Philos',PURA:'Pura',RASSASI:'Rassasi',HAWAS:'Hawas',FOR:'For',HIM:'Him',
  YARA:'Yara',BOTELLAS:'Botellas',STANLEY:'Stanley',CABLE:'Cable',CARGA:'Carga',RAPIDA:'Rápida',
  CARGADOR:'Cargador',TIPO:'Tipo',REGALO:'Regalo',BOX:'Box',LOS:'Los',SIMPSON:'Simpson',
  '100ML':'100 ml','60ML':'60 ml','650ML':'650 ml',
};
const approvedTitlePattern = new RegExp(`(?<![\\p{L}\\p{N}_-])(${Object.keys(approvedTitleWords).join('|')})(?![\\p{L}\\p{N}_-])`, 'gu');

export function publicProductName(name:string):string {
  return name.replace(approvedTitlePattern,word=>approvedTitleWords[word]);
}
