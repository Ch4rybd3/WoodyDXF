# WoodyDXF

Application web pour concevoir des pièces en bois destinées à une **défonceuse numérique (CNC)** et exporter des fichiers **DXF** prêts pour la FAO. Tout tourne dans le navigateur : rien à installer, aucune donnée envoyée sur un serveur.

👉 **En ligne : https://ch4rybd3.github.io/WoodyDXF/**

## Modules

| Module | État | Rôle |
|---|---|---|
| **Topo** | ✅ | Tableaux en relief : un lieu réel découpé en couches à empiler |
| **Atelier** | ✅ v0.1 | Calepinage des pièces dans les panneaux et devis |
| **Lames** | ✅ v0.1 | Mobilier et panneaux muraux en lames de bois |

Le cadrage complet (fonctionnalités, feuille de route) est dans [CADRAGE.md](CADRAGE.md).

## Topo : mode d'emploi

1. Cherche un lieu, puis déplace ou redimensionne le cadre orange avec ses poignées.
2. Choisis la forme (rectangle ou cercle), le format en mm et la largeur réelle couverte (ou l'échelle).
3. Règle l'épaisseur des couches (épaisseur de ton contreplaqué) et l'exagération verticale, ou impose un nombre de couches.
4. **Calculer les couches**, puis vérifie dans les onglets *Couches* et *3D*.
5. **Télécharger les DXF** : un ZIP avec un DXF par couche, un DXF regroupant toutes les couches et un récapitulatif.

### Calques DXF (unités : mm, format R12)

| Calque | Opération |
|---|---|
| `CUT_OUTSIDE` | Découpe extérieure (fraise à l'extérieur du trait) |
| `CUT_INSIDE` | Découpe intérieure (trous) |
| `ENGRAVE` | Gravure sur le trait : courbes fines, repères de pose, numéros |
| `INFO` | Indications, non usinées |
| `CUT_OFFCUT` | Atelier : recoupe de la chute à garder (en dernier, ou à la scie) |

Chaque couche N porte, gravés, le contour de la couche N+1 (repère de collage) et son numéro, placé là où la couche suivante le cachera.

## Lames : mode d'emploi

1. Choisis un modèle de départ : comptoir, banc, bureau, goutte d'eau ou panneau mural.
2. Règle les dimensions, l'épaisseur des lames (celle de ton panneau) et l'espacement (0 = lames jointives).
3. Déforme la face avant ou le dessus avec un motif (vague, diagonale, damier, galbe, goutte d'eau…), son amplitude et le nombre d'ondulations. La goutte d'eau dessine des ondes concentriques autour d'un point d'impact réglable, avec une atténuation.
4. Ajoute des découpes (rectangles ou trous ronds) : niche, passage de jambes, poignée, passe-câble. Elles traversent toutes les lames concernées.
5. Place les tiges filetées (automatiquement ou à la main) ; les entretoises sont générées si les lames sont espacées.
6. Télécharge un DXF par lame (numéro gravé) ou envoie le tout à l'Atelier pour le calepinage et le devis.

Repère d'une lame : u = profondeur depuis le dos, v = hauteur depuis le sol, x = position le long de la longueur.

## Atelier : mode d'emploi

1. Envoie un projet depuis Topo ou Lames (« Calepiner et chiffrer dans l'Atelier ») et/ou ajoute des pièces rectangulaires dans l'onglet *Pièces à la main*.
2. Renseigne tes panneaux (dimensions, épaisseur, prix, sens du fil) dans l'onglet *Bibliothèque* : les prix par défaut sont indicatifs.
3. Règle la machine (table, Ø fraise, espacement, marge, avance, passes) et le devis (consommables, main d'œuvre, marge).
4. Le calepinage se recalcule tout seul : panneaux nécessaires, taux d'utilisation, temps machine, prix de revient et prix conseillé.
5. **Télécharger les DXF par panneau** : un DXF par panneau avec les pièces déjà placées, plus le devis.

Deux modes de calepinage : **formes imbriquées** (par défaut : suit le vrai contour des pièces, rotation par 90°, petites pièces logées dans les trous des grandes, calcul en arrière-plan) ou **rectangles** (MaxRects, plus rapide). Les pièces restent tournées de 0° ou 180° seulement sur un panneau avec fil.

**Chutes en stock** (onglet *Chutes*) : les chutes de la bonne épaisseur sont essayées avant d'entamer un panneau neuf. L'Atelier compare plusieurs façons de les remplir (et sans elles) et garde celle qui consomme le moins de matière, chutes à garder déduites. Chaque panneau montre en hachuré la chute récupérable (calque DXF `CUT_OFFCUT` pour la recouper) ; après la découpe, **Valider la découpe** retire les chutes utilisées du stock et y ajoute les nouvelles, avec leur valeur au prorata. Dans le devis, les chutes sont comptées à leur valeur ou offertes.

## Aide intégrée

La page **Aide** (`#/aide`) explique chaque réglage des trois modules, avec sa valeur par défaut, des conseils et des captures d'écran, et une recherche. Dans les modules, le petit **?** à côté d'un réglage affiche son explication sur place ; celui d'un titre de section ouvre la page d'aide correspondante dans un nouvel onglet.

Le texte vit dans un seul fichier, `src/help/content.ts`, qui alimente la page et les bulles. Les captures (`public/aide/*.webp`) se régénèrent avec `npm run dev` puis `npm run captures` (Edge ou Chrome requis).

## Développement

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # génère dist/
```

Chaque push sur `main` est publié automatiquement sur GitHub Pages (`.github/workflows/deploy.yml`).

## Données et licences

- Relief : [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Mapzen ; SRTM, NASA, EU-DEM, etc.).
- Fonds de carte et recherche : © contributeurs [OpenStreetMap](https://www.openstreetmap.org/copyright), [OpenTopoMap](https://opentopomap.org) (CC-BY-SA), Nominatim.
