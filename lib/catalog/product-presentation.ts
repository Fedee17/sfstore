const approvedTitleWords:Record<string,string>={MALEKA:'Maleka',POUR:'Pour',FEMME:'Femme',BOCA:'Boca',JUNIORS:'Juniors',RIVER:'River',PLATE:'Plate'};

export function publicProductName(name:string):string {
  return name.replace(/\b(MALEKA|POUR|FEMME|BOCA|JUNIORS|RIVER|PLATE)\b/g,word=>approvedTitleWords[word]);
}
