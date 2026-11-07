# WoodyDXF

Application web pour concevoir des pièces en bois destinées à une **défonceuse numérique (CNC)** et exporter des fichiers **DXF** prêts pour la FAO. Tout tourne dans le navigateur : rien à installer, aucune donnée envoyée sur un serveur.

👉 **En ligne : https://ch4rybd3.github.io/WoodyDXF/**

## Modules

| Module | État | Rôle |
|---|---|---|
| **Topo** | ✅ v0.1 | Tableaux en relief : un lieu réel découpé en couches à empiler |
| **Atelier** | 🚧 | Calepinage des pièces dans les panneaux et devis |
| **Lames** | 🚧 | Mobilier et panneaux muraux en lames de bois |

Le cadrage complet (fonctionnalités, feuille de route) est dans [CADRAGE.md](CADRAGE.md).

## Topo : mode d'emploi

1. Cherche un lieu ou déplace la carte : le cadre orange suit le centre.
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
