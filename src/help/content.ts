// Documentation de l'application : source unique pour la page Aide et les bulles « ? » des modules.
// `key` relie un paramètre à son champ : valeur de data-k / data-p / data-seg, ou « #id » d'un élément.

export interface HelpItem {
  key: string;
  label: string;
  text: string;
  /** conseil pratique, affiché à part */
  tip?: string;
  /** valeur par défaut, en clair */
  def?: string;
}

export interface HelpSection {
  id: string;
  title: string;
  /** début du titre de la section dans le module (h3 du panneau ou h2 d'un onglet), pour y poser le lien « ? » */
  heading?: string;
  intro?: string;
  /** capture d'écran (dossier public/aide) */
  shot?: string;
  items: HelpItem[];
}

export interface HelpModule {
  id: string;
  title: string;
  intro: string;
  shot?: string;
  /** étapes de prise en main */
  steps?: string[];
  sections: HelpSection[];
}

export const HELP: HelpModule[] = [
  {
    id: 'general',
    title: 'Prise en main',
    intro: 'WoodyDXF prépare des fichiers DXF pour une défonceuse numérique (CNC) à bois. Tout se calcule dans ton navigateur : rien n’est envoyé sur un serveur, et tes réglages sont gardés sur cet appareil.',
    shot: 'accueil.webp',
    steps: [
      '**Topo** : choisis un lieu sur la carte, un format et une épaisseur de couche. Le relief réel est découpé en couches à empiler et à coller.',
      '**Lames** : choisis un meuble ou un panneau, déforme sa face avec un motif, ajoute des découpes. L’objet est tranché en lames assemblées par des tiges filetées.',
      '**Atelier** : reçoit les pièces de Topo ou de Lames (bouton « Calepiner et chiffrer dans l’Atelier »), les range dans tes panneaux et calcule le prix de revient.',
      'Télécharge les DXF, ouvre-les dans ton logiciel de FAO (VCarve, Fusion, Estlcam, LightBurn…) et associe chaque calque à une opération d’usinage.',
    ],
    sections: [
      {
        id: 'calques',
        title: 'Calques des fichiers DXF',
        intro: 'Tous les DXF sont au format R12, en millimètres, origine en bas à gauche. Chaque calque correspond à une opération : dans ta FAO, sélectionne les vecteurs par calque.',
        items: [
          { key: 'CUT_OUTSIDE', label: 'CUT_OUTSIDE (rouge)', text: 'Découpe extérieure : la fraise passe à l’extérieur du trait, la pièce garde ses cotes.' },
          { key: 'CUT_INSIDE', label: 'CUT_INSIDE (bleu)', text: 'Découpe intérieure (trous, évidements) : la fraise passe à l’intérieur du trait.' },
          { key: 'ENGRAVE', label: 'ENGRAVE (blanc/noir)', text: 'Gravure sur le trait, à faible profondeur : courbes de niveau fines, repères de pose, numéros des pièces.', tip: 'Une fraise en V de 60° ou 90° et 0,5 mm de profondeur suffisent.' },
          { key: 'DRILL', label: 'DRILL (magenta)', text: 'Réservé aux perçages ponctuels. Les trous des tiges filetées de Lames sont des trous détourés, sur CUT_INSIDE.' },
          { key: 'INFO', label: 'INFO (gris)', text: 'Indications non usinées : contour du panneau, numéros de repérage. Ne lui associe aucun parcours.' },
          { key: 'CUT_OFFCUT', label: 'CUT_OFFCUT (cyan)', text: 'Atelier : trait de recoupe de la chute à garder. À usiner en dernier, ou à faire à la scie.' },
        ],
      },
      {
        id: 'conseils',
        title: 'Conseils d’usinage',
        items: [
          { key: 'tabs', label: 'Ponts de maintien', text: 'Ajoute des ponts (tabs) dans ta FAO pour que les pièces découpées ne bougent pas en fin de passe. WoodyDXF n’en dessine pas : chaque FAO les gère mieux elle-même.' },
          { key: 'fraise', label: 'Diamètre de fraise', text: 'Renseigne le même Ø de fraise partout (Topo, Lames, Atelier) : il sert à supprimer les détails trop fins, à dessiner les os de chien et à espacer les pièces.' },
          { key: 'epaisseur', label: 'Épaisseur réelle des panneaux', text: 'Un contreplaqué « 3 mm » fait souvent 2,8 ou 3,2 mm. Mesure-le au pied à coulisse et entre la vraie valeur : la hauteur totale d’un relief ou l’assemblage des lames en dépend.' },
          { key: 'donnees', label: 'Où sont mes réglages ?', text: 'Dans le stockage de ce navigateur. Ils restent après fermeture, mais pas sur un autre appareil ni en navigation privée.' },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ TOPO
  {
    id: 'topo',
    title: 'Topo · Tableaux en relief',
    intro: 'Topo transforme le relief réel d’un lieu en couches de bois à découper puis à empiler. Chaque couche correspond à une tranche d’altitude.',
    shot: 'topo-carte.webp',
    steps: [
      'Cherche un lieu, puis place le cadre sur la carte (glisser pour déplacer, poignées pour redimensionner).',
      'Choisis la forme et le format du tableau, puis la largeur réelle couverte (ou l’échelle).',
      'Règle l’épaisseur des couches (celle de ton contreplaqué) et l’exagération du relief.',
      'Clique « Calculer les couches », puis vérifie le résultat dans les onglets Couches et 3D.',
      'Télécharge les DXF, ou envoie les couches à l’Atelier pour les ranger dans des panneaux et chiffrer.',
    ],
    sections: [
      {
        id: 'lieu', title: 'Lieu', heading: '1 · Lieu', shot: 'topo-lieu.webp',
        items: [
          { key: '#q', label: 'Rechercher un lieu', text: 'Tape un nom de lieu (lac, montagne, ville) puis « Chercher » ; clique un résultat pour y centrer la carte et le cadre. Recherche par OpenStreetMap (Nominatim).' },
          { key: 'cadre', label: 'Cadre sur la carte', text: 'Le rectangle (ou le cercle) orange est la zone découpée. Glisse-le pour le déplacer. Les poignées des coins l’agrandissent en gardant les proportions ; celles des côtés changent la hauteur du format.' },
          { key: '#fitView', label: 'Cadre au centre de la vue', text: 'Ramène le cadre au milieu de la carte affichée, à une taille raisonnable. Pratique après avoir navigué loin.' },
          { key: '#showFrame', label: 'Voir le cadre', text: 'Recentre la carte sur le cadre.' },
        ],
      },
      {
        id: 'format', title: 'Cadre et format', heading: '2 · Cadre et format', shot: 'topo-format.webp',
        items: [
          { key: 'shape', label: 'Rectangle / Cercle', text: 'Forme du tableau. Un cercle donne un tableau rond de diamètre « Largeur ».', def: 'Rectangle' },
          { key: 'widthMm', label: 'Largeur', text: 'Largeur du tableau fini, en mm (diamètre pour un cercle).', def: '300 mm' },
          { key: 'heightMm', label: 'Hauteur', text: 'Hauteur du tableau fini, en mm (rectangle seulement). Change le rapport largeur/hauteur du cadre sur la carte.', def: '400 mm' },
          { key: '#presets', label: 'Formats rapides', text: 'Formats courants (20×20, 30×40, Ø 30…) en cm. L’échelle est conservée : la zone couverte grandit avec le format.' },
          { key: '#realKm', label: 'Largeur réelle', text: 'Distance sur le terrain couverte par la largeur du tableau, en km. Changer cette valeur agrandit ou rétrécit le cadre sur la carte.' },
          { key: '#scale', label: 'Échelle 1:', text: 'Même réglage que « Largeur réelle », exprimé en échelle de carte : 1:25 000 signifie que 1 mm sur le tableau vaut 25 m sur le terrain.' },
        ],
      },
      {
        id: 'couches', title: 'Couches', heading: '3 · Couches',
        items: [
          { key: 'layerMm', label: 'Épaisseur d’une couche', text: 'Épaisseur du panneau dans lequel chaque couche est découpée. Mesure ton contreplaqué : c’est elle qui fixe la hauteur réelle du relief.', def: '3 mm' },
          { key: 'mode', label: 'Exagération / Nb de couches', text: 'Deux façons de régler la hauteur du relief : par un coefficient d’exagération (le nombre de couches en découle), ou en imposant le nombre de couches (l’exagération en découle).' },
          { key: 'exaggeration', label: 'Exagération verticale', text: 'Multiplie les altitudes par rapport à l’échelle horizontale. 1 = relief vrai (souvent très plat sur un tableau) ; 1,5 à 3 donne un relief lisible.', def: '1,5×', tip: 'Pour un paysage plat (lac, plaine), monte à 3 ou 5 ; pour la haute montagne, reste entre 1 et 1,5.' },
          { key: 'layerCount', label: 'Nombre de couches (fond compris)', text: 'Nombre total de couches à découper, la couche de fond pleine comprise. Entre 2 et 120.', def: '12' },
          { key: '#baseAlt', label: 'Altitude de base', text: 'Altitude (m) du dessus de la couche de fond. Vide = le point le plus bas de la zone. Monte-la pour ne pas gaspiller de couches sous un lac ou une vallée.' },
        ],
      },
      {
        id: 'fabrication', title: 'Fabrication', heading: '4 · Fabrication',
        items: [
          { key: 'toolMm', label: 'Ø fraise', text: 'Diamètre de la fraise de découpe. Sert à repérer les parties trop étroites pour être usinées.', def: '3 mm' },
          { key: 'smoothMm', label: 'Lissage', text: 'Adoucit les contours (rayon en mm sur le tableau). 0 = contours bruts, plus anguleux ; au-delà de 2 mm, les petits reliefs s’effacent.', def: '1,2 mm' },
          { key: 'minPieceMm2', label: 'Pièce mini', text: 'Les îlots plus petits que cette surface (mm²) sont supprimés : ils seraient trop fragiles à découper et à coller.', def: '25 mm²' },
          { key: 'minHoleMm2', label: 'Trou mini', text: 'Les trous plus petits que cette surface (mm²) sont bouchés.', def: '25 mm²' },
          { key: 'resolution', label: 'Précision du relief', text: 'Nombre de points d’altitude sur la largeur du cadre. Plus fin = contours plus détaillés, calcul plus long et plus de données téléchargées.', def: 'Normale (500 px)' },
          { key: 'removeThin', label: 'Supprimer les pièces plus fines que la fraise', text: 'Retire les morceaux où la fraise ne peut pas passer (bandes plus étroites que son diamètre). Décoché, ces parties restent et sont signalées.', def: 'oui' },
        ],
      },
      {
        id: 'eau', title: 'Eau', heading: '5 · Eau',
        items: [
          { key: 'water', label: 'Intégrer lacs, retenues et rivières', text: 'Récupère les plans d’eau d’OpenStreetMap, les aplatit à leur altitude réelle et les découpe au contour exact du rivage. Les pièces d’eau sont exportées à part (eau.dxf), pour une teinte ou de la résine.', def: 'oui', tip: 'Si les serveurs OpenStreetMap ne répondent pas, le calcul se fait sans l’eau, avec un avertissement : relance plus tard.' },
          { key: 'waterDepth', label: 'Profondeur de l’eau', text: 'À fleur : la surface de l’eau est plane, au niveau du rivage. Creusée de 1 à 3 couches : l’eau est plus basse que la berge, pour couler de la résine.', def: 'Creusée d’1 couche' },
        ],
      },
      {
        id: 'gravures', title: 'Gravures', heading: '6 · Gravures',
        items: [
          { key: 'fineLines', label: 'Courbes fines gravées par couche', text: 'Courbes de niveau intermédiaires gravées sur chaque couche, entre deux découpes : le relief paraît plus fin sans couches supplémentaires.', def: '2 courbes' },
          { key: 'guides', label: 'Repères de pose', text: 'Grave sur chaque couche le contour de la couche du dessus : tu sais exactement où la coller.', def: 'oui' },
          { key: 'numbers', label: 'Numéros de couche', text: 'Grave le numéro de chaque pièce là où la couche suivante le cachera.', def: 'oui' },
          { key: '#overlay', label: 'Superposer le résultat sur la carte', text: 'Affiche les couches calculées par-dessus la carte, pour vérifier le cadrage.' },
        ],
      },
      {
        id: 'resultats', title: 'Calcul et résultats', shot: 'topo-couches.webp',
        items: [
          { key: '#go', label: 'Calculer les couches', text: 'Télécharge le relief (AWS Terrain Tiles) et l’eau, puis calcule les couches. Le résumé sous les boutons donne le nombre de couches, la hauteur totale, l’échelle et les avertissements.' },
          { key: 'onglet-couches', label: 'Onglet Couches', text: 'Chaque couche en vue de dessus : découpe en rouge, gravure, numéro, couche du dessous en grisé. Le curseur passe d’une couche à l’autre ; « Vue empilée » montre tout le relief.' },
          { key: 'onglet-3d', label: 'Onglet 3D', text: 'Le tableau empilé en 3D : clic-glisser pour tourner, molette pour zoomer.' },
          { key: '#dl', label: 'Télécharger les DXF (.zip)', text: 'Un DXF par couche, un DXF regroupant toutes les couches, eau.dxf s’il y a de l’eau, et un récapitulatif.' },
          { key: '#toAtelier', label: 'Calepiner et chiffrer dans l’Atelier', text: 'Envoie toutes les pièces à l’Atelier, qui les range dans tes panneaux (pièces imbriquées dans les trous des couches) et calcule le devis. Les pièces d’eau y sont décochées par défaut.' },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ LAMES
  {
    id: 'lames',
    title: 'Lames · Mobilier paramétrique',
    intro: 'Lames découpe un volume (comptoir, banc, bureau, panneau mural…) en tranches parallèles de bois. Les lames sont assemblées par des tiges filetées, avec ou sans entretoises entre elles.',
    shot: 'lames-3d.webp',
    steps: [
      'Pars d’un modèle (section 1), puis ajuste les dimensions.',
      'Règle l’épaisseur des lames (celle de ton panneau) et l’espacement.',
      'Choisis le motif qui déforme la face avant ou le dessus.',
      'Ajoute des découpes (niche, passage de jambes, poignée) puis place les tiges.',
      'Vérifie dans les onglets 3D et Lames, puis télécharge les DXF ou envoie à l’Atelier.',
    ],
    sections: [
      {
        id: 'modele', title: 'Modèle', heading: '1 · Modèle',
        items: [
          { key: '#presets', label: 'Modèles', text: 'Points de départ réglés : comptoir, banc, bureau, goutte d’eau, panneau mural. Choisir un modèle remplace tous les réglages en cours.' },
          { key: '#name', label: 'Nom du projet', text: 'Nom utilisé pour les fichiers téléchargés et dans l’Atelier.' },
        ],
      },
      {
        id: 'dimensions', title: 'Dimensions', heading: '2 · Dimensions',
        intro: 'Repères utilisés partout dans Lames : x = position le long de la longueur, u = profondeur mesurée depuis le dos, v = hauteur mesurée depuis le sol.',
        items: [
          { key: 'L', label: 'Longueur', text: 'Dimension le long de laquelle les lames sont empilées (axe x). Le nombre de lames en découle.' },
          { key: 'P', label: 'Profondeur', text: 'Profondeur de l’objet (axe u, du dos vers l’avant) : c’est la largeur de chaque lame.' },
          { key: 'H', label: 'Hauteur', text: 'Hauteur de l’objet (axe v, du sol vers le haut) : c’est la hauteur de chaque lame. Pour un panneau mural, c’est son épaisseur hors tout.' },
        ],
      },
      {
        id: 'lames', title: 'Lames', heading: '3 · Lames',
        items: [
          { key: 'thickness', label: 'Épaisseur', text: 'Épaisseur des lames, donc du panneau dans lequel elles sont découpées.', tip: 'Mesure ton panneau : sur 50 lames, 0,2 mm d’écart fait 1 cm de longueur en plus.' },
          { key: 'gap', label: 'Espacement', text: 'Vide entre deux lames, en mm. 0 = lames jointives, collées ou serrées. Au-delà, des entretoises de cette épaisseur sont générées sur chaque tige.', tip: 'Choisis un espacement qui existe en panneau (3, 5, 6 mm…) : les entretoises y sont découpées.' },
        ],
      },
      {
        id: 'forme', title: 'Forme', heading: '4 · Forme', shot: 'lames-goutte.webp',
        items: [
          { key: 'face', label: 'Face avant / Dessus', text: 'Face déformée par le motif. Face avant : la profondeur varie (façade de comptoir ondulée). Dessus : la hauteur varie (assise, plateau ou panneau mural en relief).' },
          { key: 'motif', label: 'Motif', text: 'Aucun (forme droite), vague le long, vagues en diagonale, bosses en damier, galbe (creux au milieu de la face), galbe ondulé, creux central, goutte d’eau (ondes concentriques).' },
          { key: 'amplitude', label: 'Amplitude', text: 'Profondeur maximale du motif, en mm : de combien la face est creusée au plus bas.' },
          { key: 'minMaterial', label: 'Matière mini', text: 'Largeur de bois minimale gardée partout sous le motif, en mm. Si l’amplitude est trop forte, la face est écrêtée à cette valeur et un avertissement s’affiche.' },
          { key: 'kx', label: 'Ondulations (longueur)', text: 'Nombre de vagues sur la longueur. Pour la goutte d’eau : nombre d’ondes sur la plus grande dimension.' },
          { key: 'kz', label: 'Ondulations (face)', text: 'Nombre de vagues dans l’autre direction de la face (hauteur pour la face avant, profondeur pour le dessus). Sert aux motifs diagonale et damier ; pour le galbe, règle la forme du creux.' },
          { key: 'dropX', label: 'Impact : position en longueur', text: 'Goutte d’eau : position du point d’impact le long de la longueur, en % (0 = début, 50 = milieu, 100 = fin).', def: '50 %' },
          { key: 'dropY', label: 'Impact : position sur la face', text: 'Goutte d’eau : position du point d’impact dans l’autre direction de la face, en %. 50 % / 50 % = goutte au centre.', def: '50 %' },
          { key: 'dropDamp', label: 'Atténuation des ondes', text: 'Goutte d’eau : plus la valeur est forte, plus les ondes s’effacent en s’éloignant du point d’impact. 0 = ondes de même hauteur partout.' },
          { key: 'phase', label: 'Décalage de la vague', text: 'Fait glisser le motif, en degrés : 180° inverse creux et bosses. Pour la goutte d’eau : 180° met une bosse au centre au lieu d’un creux.' },
        ],
      },
      {
        id: 'decoupes', title: 'Découpes', heading: '5 · Découpes',
        intro: 'Volumes retirés de toutes les lames qu’ils traversent : niche, passage de jambes, évidement pour alléger, poignée, passe-câble.',
        items: [
          { key: '#addRect', label: '+ Rectangle', text: 'Volume rectangulaire de « x de » à « x à » (le long), « u de » à « u à » (profondeur) et « v de » à « v à » (hauteur). Une valeur qui dépasse le bord (u de −1, v de −1…) ouvre la découpe vers l’extérieur, par exemple un passage de jambes ouvert au sol et à l’arrière.' },
          { key: '#addCircle', label: '+ Trou rond', text: 'Cylindre horizontal qui traverse les lames de « x de » à « x à », centré en (u, v), avec un rayon : passe-câble, poignée, trou de suspension.' },
          { key: 'dogbones', label: 'Os de chien aux angles intérieurs', text: 'Ajoute un dégagement rond dans chaque angle intérieur des découpes, pour qu’une pièce à angles vifs (tablette, tasseau) s’y emboîte malgré le rayon de la fraise.' },
        ],
      },
      {
        id: 'assemblage', title: 'Assemblage', heading: '6 · Assemblage', shot: 'lames-lame.webp',
        items: [
          { key: 'rodD', label: 'Ø tige filetée', text: 'Diamètre des tiges filetées qui traversent et serrent les lames (M6, M8…). Les trous sont percés à ce diamètre.', def: '8 mm' },
          { key: 'rodCount', label: 'Tiges par zone', text: 'Nombre de tiges placées automatiquement dans chaque groupe de lames qui ont la même forme (les lames coupées par une découpe forment une zone à part).', def: '3' },
          { key: '#autoRods', label: 'Placer les tiges automatiquement', text: 'Répartit les tiges dans la matière commune à toutes les lames de chaque zone, loin des bords. Une tige qui traverserait un vide est coupée en tronçons (a, b…).' },
          { key: '#addRod', label: '+ Tige', text: 'Ajoute une tige à placer à la main par ses coordonnées u (profondeur) et v (hauteur). La longueur et les tronçons s’affichent à côté.' },
          { key: 'spacerD', label: 'Ø entretoises', text: 'Diamètre extérieur des entretoises (rondelles de bois glissées sur les tiges entre les lames, quand l’espacement n’est pas nul).', def: '30 mm' },
          { key: 'toolMm', label: 'Ø fraise', text: 'Diamètre de la fraise : taille des os de chien et contrôle des parties trop fines.', def: '6 mm' },
          { key: 'density', label: 'Densité du bois', text: 'Masse volumique (kg/m³) pour estimer le poids : environ 450 pour le peuplier, 650 pour le bouleau, 750 pour le MDF.', def: '650 kg/m³' },
          { key: 'numbers', label: 'Numéros gravés sur chaque lame', text: 'Grave le numéro d’ordre de la lame, pour l’assemblage.', def: 'oui' },
          { key: '#dl', label: 'Télécharger les DXF (.zip)', text: 'Un DXF par lame, un DXF de toutes les lames, un DXF des entretoises et un récapitulatif (nombre de lames, tiges à couper avec leurs longueurs, poids).' },
          { key: '#toAtelier', label: 'Calepiner et chiffrer dans l’Atelier', text: 'Envoie les lames et les entretoises à l’Atelier pour les ranger dans tes panneaux et chiffrer.' },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ ATELIER
  {
    id: 'atelier',
    title: 'Atelier · Calepinage et devis',
    intro: 'L’Atelier range les pièces dans les panneaux de ta bibliothèque (le calepinage), réutilise tes chutes et calcule le temps machine, le prix de revient et un prix de vente conseillé. Tout se recalcule à chaque changement.',
    shot: 'atelier-calepinage.webp',
    steps: [
      'Envoie un projet depuis Topo ou Lames, et/ou ajoute des pièces rectangulaires dans l’onglet « Pièces à la main ».',
      'Renseigne tes vrais panneaux et leurs prix dans l’onglet « Bibliothèque ».',
      'Règle la machine et le devis (sections 3 et 4).',
      'Vérifie le calepinage, puis télécharge un DXF par panneau.',
      'Après la découpe, « Valider la découpe » met ton stock de chutes à jour.',
    ],
    sections: [
      {
        id: 'projet', title: 'Projet', heading: '1 · Projet',
        items: [
          { key: '#job', label: 'Projet reçu', text: 'Le dernier projet envoyé par Topo ou Lames, avec ses groupes de pièces (couches, eau, lames, entretoises). Décoche un groupe pour ne pas le découper ; « Retirer le projet » vide l’Atelier.' },
        ],
      },
      {
        id: 'panneaux', title: 'Panneaux à utiliser', heading: '2 · Panneaux à utiliser',
        items: [
          { key: '#choice', label: 'Panneau par épaisseur', text: 'Pour chaque épaisseur de pièces, le panneau utilisé. « Automatique » essaie tous les panneaux de cette épaisseur et garde le moins cher pour ce projet.' },
          { key: 'nesting', label: 'Calepinage', text: 'Formes imbriquées : suit le vrai contour des pièces, les tourne par quart de tour et loge les petites dans les trous des grandes (calcul de 1 à quelques secondes). Rectangles : range les rectangles qui entourent les pièces, instantané mais moins serré.', def: 'Formes imbriquées' },
          { key: 'precision', label: 'Précision', text: 'Fine : grille plus serrée et un ordre de placement de plus. Gagne parfois quelques centimètres, au prix d’un calcul plus long.', def: 'Normale' },
          { key: '#useOffcuts', label: 'Utiliser d’abord les chutes du stock', text: 'Essaie de placer les pièces dans les chutes de l’onglet « Chutes » avant d’entamer un panneau neuf. L’Atelier compare plusieurs façons de faire, dont « sans chute », et garde celle qui consomme le moins de bois.', def: 'oui' },
          { key: 'minOffcut', label: 'Chute gardée si ses deux côtés font au moins', text: 'Taille minimale d’une chute récupérable, en mm. Plus petite, elle est considérée comme perdue : elle n’est ni hachurée, ni ajoutée au stock.', def: '150 mm' },
        ],
      },
      {
        id: 'machine', title: 'Machine', heading: '3 · Machine',
        items: [
          { key: 'machine.bedW', label: 'Table : longueur / largeur', text: 'Surface de travail de ta CNC, en mm. Un panneau plus grand est signalé : il faudra le recouper avant de l’usiner.', def: '2500 × 1250 mm' },
          { key: 'machine.toolMm', label: 'Ø fraise', text: 'Diamètre de la fraise de découpe. L’espace entre pièces n’est jamais inférieur à ce diamètre.', def: '3 mm' },
          { key: 'machine.spacingMm', label: 'Espace entre pièces', text: 'Distance minimale entre deux pièces, en mm. En mode « Formes imbriquées », l’écart réel est un peu plus large (environ 2 mm de plus), à cause de la grille de calcul.', def: '6 mm' },
          { key: 'machine.marginMm', label: 'Marge au bord', text: 'Bande laissée libre sur le pourtour du panneau (bords abîmés, brides de serrage).', def: '10 mm' },
          { key: 'machine.passDepthMm', label: 'Profondeur de passe', text: 'Profondeur usinée à chaque passage. Le nombre de passes vaut l’épaisseur du panneau divisée par cette valeur.', def: '3 mm' },
          { key: 'machine.feedMmMin', label: 'Avance découpe', text: 'Vitesse d’avance en découpe (mm/min), pour estimer le temps machine.', def: '1500 mm/min' },
          { key: 'machine.engraveFeedMmMin', label: 'Avance gravure', text: 'Vitesse d’avance en gravure (mm/min).', def: '2000 mm/min' },
          { key: 'machine.contourSec', label: 'Plongée par contour', text: 'Temps perdu à chaque contour (déplacement, plongée, remontée), en secondes.', def: '4 s' },
          { key: 'machine.sheetSetupMin', label: 'Mise en place / panneau', text: 'Temps pour poser, brider et référencer un panneau, en minutes.', def: '5 min' },
          { key: 'machine.hourlyRate', label: 'Coût horaire machine', text: 'Coût d’une heure de machine (usure, électricité, amortissement), en €/h.', def: '30 €/h' },
        ],
      },
      {
        id: 'devis', title: 'Devis', heading: '4 · Devis', shot: 'atelier-devis.webp',
        items: [
          { key: 'quote.material', label: 'Panneaux entiers / Chute déduite', text: 'Panneaux entiers : chaque panneau entamé est facturé en entier. Chute déduite : le dernier panneau n’est compté qu’à la longueur utilisée, le reste repart en stock.', def: 'Panneaux entiers' },
          { key: 'quote.offcuts', label: 'Chutes à leur valeur / offertes', text: 'Les chutes du stock utilisées sont facturées à leur valeur (prorata du prix du panneau d’origine) ou offertes au client.', def: 'À leur valeur' },
          { key: 'quote.consumables', label: 'Consommables', text: 'Colle, vernis, résine, quincaillerie, tiges filetées… en €.', def: '10 €' },
          { key: 'quote.marginPct', label: 'Marge', text: 'Pourcentage ajouté au prix de revient pour obtenir le prix de vente conseillé.', def: '30 %' },
          { key: 'quote.laborH', label: 'Main d’œuvre', text: 'Heures de travail à la main : ponçage, collage, assemblage, finition.', def: '2 h' },
          { key: 'quote.laborRate', label: 'Taux horaire', text: 'Coût d’une heure de main d’œuvre, en €/h.', def: '25 €/h' },
          { key: '#dl', label: 'Télécharger les DXF par panneau', text: 'Un ZIP avec un DXF par panneau (pièces déjà placées, numérotées), le devis en texte et une notice.' },
        ],
      },
      {
        id: 'calepinage', title: 'Onglet Calepinage', heading: 'Calepinage',
        items: [
          { key: 'sheets', label: 'Panneaux', text: 'Chaque panneau avec ses pièces placées, son taux d’utilisation et la longueur utilisée. Le pointillé marque la marge au bord ; la zone hachurée verte est la chute à garder.' },
          { key: '#validate', label: 'Valider la découpe', text: 'Une fois la découpe faite : retire du stock les chutes utilisées, ajoute les chutes à garder avec leur valeur, puis retire le projet et les pièces à la main de l’Atelier. Télécharge les DXF avant.' },
        ],
      },
      {
        id: 'chutes', title: 'Onglet Chutes', heading: 'Chutes en stock', shot: 'atelier-chutes.webp',
        items: [
          { key: 'stock.panelId', label: 'Matière', text: 'Panneau de la bibliothèque d’où vient la chute : elle ne sert alors que pour cette matière. « Matière libre » : sert pour toute matière de la même épaisseur.' },
          { key: 'stock.name', label: 'Repère', text: 'Nom libre pour retrouver la chute dans l’atelier (étagère, couleur…).' },
          { key: 'stock.size', label: 'Longueur, largeur, épaisseur', text: 'Dimensions de la chute rectangulaire, en mm.' },
          { key: 'stock.value', label: 'Valeur', text: 'Prix de la chute en €, pour le devis. Les chutes ajoutées par « Valider la découpe » sont estimées au prorata de la surface du panneau d’origine.' },
        ],
      },
      {
        id: 'bibliotheque', title: 'Onglet Bibliothèque', heading: 'Bibliothèque de panneaux',
        items: [
          { key: 'lib.size', label: 'Nom, longueur, largeur, épaisseur', text: 'Tes panneaux tels que ton fournisseur les vend. Les prix proposés sont indicatifs : remplace-les.' },
          { key: 'lib.price', label: 'Prix', text: 'Prix du panneau entier en €. La colonne €/m² sert à comparer.' },
          { key: 'lib.grain', label: 'Fil', text: 'Coché : le bois a un sens de fil visible, les pièces ne tournent que d’un demi-tour pour le respecter.' },
        ],
      },
      {
        id: 'manuel', title: 'Onglet Pièces à la main', heading: 'Pièces rectangulaires',
        items: [
          { key: 'manual', label: 'Pièces rectangulaires', text: 'Plateaux, étagères, fonds, cales… avec leurs dimensions, leur épaisseur et leur quantité. Elles sont calepinées avec les pièces du projet.' },
        ],
      },
    ],
  },
];

/** Supprime accents et majuscules, pour la recherche */
export const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Gras léger : **texte** */
export const md = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
