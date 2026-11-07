# WoodyDXF

Application web pour concevoir des pièces en bois destinées à une **défonceuse numérique (CNC)** et exporter des fichiers **DXF** prêts pour la FAO. Tout tourne dans le navigateur : rien à installer, aucune donnée envoyée sur un serveur.

👉 **En ligne : https://ch4rybd3.github.io/WoodyDXF/**

## Modules

| Module | État | Rôle |
|---|---|---|
| **Topo** | ✅ | Tableaux en relief : un lieu réel découpé en couches à empiler |
| **Atelier** | ✅ v0.1 | Calepinage des pièces dans les panneaux et devis |
| **Lames** | 🚧 | Mobilier et panneaux muraux en lames de bois |

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

Chaque couche N porte, gravés, le contour de la couche N+1 (repère de collage) et son numéro, placé là où la couche suivante le cachera.

## Atelier : mode d'emploi

1. Envoie un tableau depuis Topo (« Calepiner et chiffrer dans l'Atelier ») et/ou ajoute des pièces rectangulaires dans l'onglet *Pièces à la main*.
2. Renseigne tes panneaux (dimensions, épaisseur, prix, sens du fil) dans l'onglet *Bibliothèque* : les prix par défaut sont indicatifs.
3. Règle la machine (table, Ø fraise, espacement, marge, avance, passes) et le devis (consommables, main d'œuvre, marge).
4. Le calepinage se recalcule tout seul : panneaux nécessaires, taux d'utilisation, temps machine, prix de revient et prix conseillé.
5. **Télécharger les DXF par panneau** : un DXF par panneau avec les pièces déjà placées, plus le devis.

Le calepinage range les pièces par rectangles englobants (MaxRects, rotation 0°/90° sauf panneau avec fil) ; l'imbrication de formes viendra plus tard.

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
