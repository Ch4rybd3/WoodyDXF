# WoodyDXF — Document de cadrage

> Application web gratuite, hébergée sur GitHub Pages, pour concevoir des pièces en bois destinées à une défonceuse numérique (CNC) et exporter des fichiers **DXF** prêts pour la FAO (VCarve, Fusion, Estlcam, Carbide Create…).

---

## 1. Vision

Trois outils, un seul atelier :

| Module | Ce qu'il fait | Exemple |
|---|---|---|
| **A. Lames (Slicer)** | Transforme une forme 3D en une série de lames de bois découpées et assemblées côte à côte. | Comptoir/banc ondulé, tableau mural à vagues, bureau, lampe |
| **B. Topo (Cartes en relief)** | Récupère le relief réel d'un lieu et génère une couche DXF par courbe de niveau. | Tableau d'un lac de montagne, d'une île, d'une ville |
| **C. Atelier (Calepinage & devis)** | Place toutes les pièces dans les panneaux disponibles, minimise les chutes et calcule le prix. | « 37 lames → 3 panneaux de 2500×1250, 214 €, 68 % d'utilisation » |

Les modules A et B produisent des **pièces** ; le module C les **range dans des panneaux** et les **chiffre**. Tout passe par un format interne commun (liste de pièces 2D + opérations).

**Contrainte clé : 100 % dans le navigateur.** GitHub Pages ne sert que des fichiers statiques : pas de serveur, pas de base de données. Tous les calculs tournent côté client (Web Workers pour ne pas bloquer l'interface), les projets sont enregistrés dans le navigateur et exportables en fichier `.woody.json`.

---

## 2. Module A — Lames (mobilier et tableaux paramétriques)

### 2.1 Principe
1. On définit un **volume** (la forme globale).
2. On choisit un **axe de tranchage**, l'**épaisseur des lames** (épaisseur du panneau, ex. 18 mm) et l'**espacement** (0 = lames jointives, ex. 10 mm = lames espacées comme sur les photos).
3. Le logiciel coupe le volume en tranches → chaque tranche donne un **profil 2D** = une lame à découper.
4. Il ajoute automatiquement les éléments d'assemblage et la numérotation.

### 2.2 Sources de forme (par ordre de priorité)
- **Générateurs paramétriques** (MVP) :
  - *Panneau mural à vagues* : surface `z = f(x, y)` (sommes de sinus, bruit de Perlin, « points d'attraction »).
  - *Comptoir / banc / bureau* : boîte de base (L × P × H) + face avant déformée par une ou plusieurs vagues (comme la photo 1), ou galbe global (photo 2).
  - *Assise / banc organique* : profil de section + courbe de variation le long de la longueur.
- **Courbes de contrôle éditables** : l'utilisateur dessine le profil de départ et le profil d'arrivée, le logiciel interpole les lames intermédiaires (morphing).
- **Import 3D** (phase ultérieure) : fichiers STL / OBJ (modélisés dans Blender, Fusion…).
- **Image en niveaux de gris** → carte de hauteur (pour tableaux muraux).

### 2.3 Découpes dans les lames
« Faire des découpes avec les lames » est couvert à deux niveaux :
- **Découpes volumiques (opérations booléennes)** : on soustrait un volume à la forme (niche, passage de câble, poignée, logement de tiroir, plateau encastré). Chaque lame traversée est découpée en conséquence.
- **Découpes par lame** : trous, encoches, perçages, gravures appliqués à une lame précise ou à une plage de lames.

### 2.4 Assemblage
- **Tiges filetées / tourillons** : trous d'alignement traversant toutes les lames, positions réglables, diamètre réglable.
- **Entretoises** : génération automatique des cales d'espacement (rondelles bois) si espacement > 0.
- **Lames transversales (gaufrage / waffle)** : grille croisée avec encoches mi-bois, avec **dogbones** automatiques (l'outil rond ne peut pas faire d'angle intérieur vif).
- **Numérotation** : chaque lame reçoit un numéro gravé (face cachée) + un plan de montage PDF.

### 2.5 Contrôles de fabrication
- Largeur minimale de matière (une lame trop fine casse) → alerte visuelle.
- Rayon intérieur minimal = rayon de la fraise.
- Lame plus grande que le panneau → alerte (ou découpage automatique en 2 morceaux avec assemblage).
- Poids estimé (densité du matériau).

### 2.6 Visualisation
- Vue 3D temps réel (rotation, zoom), lames colorées selon le matériau.
- Vue 2D d'une lame isolée avec cotes.
- Curseur pour « éplucher » les lames une à une.

---

## 3. Module B — Topo (cartes en relief, type tableaux de lacs/montagnes)

### 3.1 Parcours utilisateur
1. **Choisir le lieu** : recherche d'adresse / nom de lieu, ou navigation sur la carte.
2. **Choisir le cadre** : rectangle, carré, cercle, ou forme personnalisée ; rotation possible.
3. **Choisir le format physique** : ex. 300 × 400 mm (presets 20×20, 30×40, 40×50, A3, A2…).
4. **Choisir les couches** : épaisseur du contreplaqué (ex. 3 mm), nombre de couches **ou** équidistance (ex. une couche tous les 50 m).
5. **Échelle et exagération verticale** : l'échelle horizontale découle du cadre et du format (ex. 1:25 000). L'exagération verticale (×1 à ×5) rend le relief lisible.
6. **Aperçu 3D** du rendu final empilé.
7. **Export** : un DXF par couche (ZIP) ou un DXF unique avec un calque par couche.

### 3.2 Calcul des couches
```
échelle horizontale   = taille réelle du cadre / taille du tableau
hauteur réelle/couche = épaisseur couche × échelle horizontale / exagération
nombre de couches     = (altitude max − altitude min) / hauteur réelle par couche
```
Le logiciel affiche ces valeurs en direct et alerte si on dépasse un nombre raisonnable de couches (coût / épaisseur totale).

### 3.3 Options de rendu
- **Eau séparée** : lacs et mer extraits (OpenStreetMap) → pièce distincte, en creux, pour résine époxy ou bois teinté (bleu sur les exemples).
- **Gravure des courbes intermédiaires** : chaque couche découpée porte aussi des courbes fines gravées (les lignes fines visibles sur les tableaux de lacs), pour plus de détail sans ajouter de couches.
- **Mode ville** : rues, bâtiments, côtes issus d'OpenStreetMap, gravés ou découpés (comme le tableau de Marseille).
- **Texte** : nom du lieu, coordonnées GPS, gravés (police à choisir).
- **Lissage** des contours et **suppression des îlots trop petits** (pièces impossibles à découper ou à coller).
- **Repères d'alignement** : trous de centrage ou encoches dans la marge pour empiler les couches précisément.
- **Couche de fond + cadre** générés automatiquement (dimension extérieure, feuillure).
- **Numérotation** des couches gravée dans une zone cachée.

### 3.4 Sources de données (gratuites, utilisables depuis le navigateur)
| Donnée | Source | Résolution | Couverture |
|---|---|---|---|
| Relief mondial | Tuiles « Terrarium » (AWS Open Data / Mapzen) | ~30 m (selon zone) | Monde |
| Relief France | IGN RGE ALTI via Géoplateforme | 1 à 5 m | France |
| Relief détaillé | Copernicus GLO-30 | 30 m | Monde |
| Eau, routes, bâtiments | OpenStreetMap (API Overpass) | — | Monde |
| Fond de carte | OpenStreetMap / IGN Plan | — | — |

Attributions obligatoires (OSM : ODbL ; IGN : Licence Ouverte) affichées dans l'appli et proposées en gravure discrète au dos.

> ⚠️ Point d'attention : ne pas reprendre le nom, le logo ni les visuels d'une marque existante. Le style « tableau topographique en bois » est un genre largement répandu ; WoodyDXF produit ses propres rendus à partir de données publiques.

---

## 4. Module C — Atelier : calepinage et chiffrage

### 4.1 Bibliothèque de panneaux
L'utilisateur enregistre ses matériaux :
- Nom (ex. « CP peuplier 3 mm », « MDF 18 mm », « Bouleau 15 mm »)
- Dimensions (ex. 2500 × 1220 mm), épaisseur
- **Prix du panneau**, densité (pour le poids)
- Sens du fil (oui/non) → interdit ou autorise la rotation des pièces
- Stock disponible (y compris **chutes** réutilisables avec leurs dimensions)

### 4.2 Paramètres machine
- Surface de travail de la CNC (une pièce ou un panneau plus grand que la table → alerte / découpage du panneau)
- Diamètre de fraise (= largeur de saignée), espacement minimal entre pièces, marge au bord du panneau
- Vitesse d'avance, profondeur de passe → **estimation du temps d'usinage**
- Ponts de maintien (tabs) : nombre et taille, pour que les pièces ne bougent pas

### 4.3 Optimisation (nesting)
- **Niveau 1 (MVP)** : rangement par rectangles englobants (algorithme MaxRects / Guillotine). Rapide, bon pour les lames et les couches.
- **Niveau 2** : vrai nesting de formes (polygones « no-fit », algorithme génétique) → pièces imbriquées, rotation libre ou par pas de 90°/15°. Gain typique : +10 à 25 % d'utilisation.
- Exécution dans un Web Worker, avec barre de progression et « continuer à optimiser » tant que l'utilisateur le souhaite.

### 4.4 Devis simulé
```
Coût matière   = nb panneaux × prix   (ou au prorata de la surface utilisée, au choix)
Coût machine   = temps d'usinage estimé × taux horaire
Consommables   = colle, tiges filetées, vernis, résine (forfaits paramétrables)
Prix de vente  = (matière + machine + consommables + main d'œuvre) × (1 + marge)
```
Affichage : nombre de panneaux, taux d'utilisation, surface de chute, poids, temps machine, détail du coût — exportable en PDF.

### 4.5 Export
- Un DXF **par panneau**, pièces déjà placées, prêt à charger dans la FAO.
- Calques DXF normalisés par opération (voir §5.2).
- Étiquettes de pièces (numéro, projet) en gravure.

---

## 5. Socle technique commun

### 5.1 Architecture
```
Navigateur (GitHub Pages)
├── UI ............... Vite + TypeScript + React (ou Svelte)
├── 3D ............... Three.js
├── Carte ............ MapLibre GL
├── Géométrie 2D ..... Clipper2 (WASM) : unions, différences, décalages (offset outil)
├── Contours relief .. d3-contour / marching squares + simplification
├── Nesting .......... MaxRects puis NFP + algorithme génétique (Web Worker)
├── Export ........... Écrivain DXF maison (R12 / AC1009 → compatible avec tout) + ZIP + PDF
└── Stockage ......... IndexedDB (projets, matériaux) + import/export .woody.json
```
Déploiement : GitHub Actions → build → GitHub Pages à chaque push sur `main`.

### 5.2 Convention DXF
- Unités : **millimètres** (`$INSUNITS = 4`), origine en bas à gauche.
- Uniquement des **polylignes fermées** pour les contours (pas de segments disjoints → la FAO détecte les formes sans retouche).
- Calques par opération (couleurs normalisées) :

| Calque | Opération | Couleur |
|---|---|---|
| `CUT_OUTSIDE` | Découpe extérieure (fraise à l'extérieur du trait) | Rouge |
| `CUT_INSIDE` | Découpe intérieure (trous, évidements) | Bleu |
| `POCKET` | Poche (lamage, zone d'eau en creux) | Vert |
| `ENGRAVE` | Gravure sur le trait (courbes fines, texte, numéros) | Noir |
| `DRILL` | Perçage (centres de trous) | Magenta |
| `INFO` | Contour du panneau, cotes (non usiné) | Gris |

### 5.3 Ce que WoodyDXF ne fait pas (au moins au début)
- Pas de génération de G-code : on s'arrête au DXF, la FAO de l'utilisateur gère les parcours d'outil. (Option possible en phase 5.)
- Pas de comptes utilisateurs ni de partage en ligne (pas de serveur).

---

## 6. Feuille de route proposée

| Phase | Contenu | Résultat |
|---|---|---|
| **0. Fondations** | Dépôt GitHub, Vite + TS, déploiement Pages, écrivain DXF, visualiseur 2D, modèle « pièce » commun | Site en ligne qui exporte un DXF test |
| **1. Topo MVP** | Carte + recherche, cadre rectangle/cercle, relief Terrarium, calcul des couches, contours lissés, export ZIP de DXF, aperçu 3D | Premier tableau relief découpable |
| **2. Atelier MVP** | Bibliothèque de panneaux, paramètres machine, nesting rectangulaire, devis, DXF par panneau | Devis + fichiers prêts à usiner |
| **3. Lames MVP** | Générateurs panneau à vagues + comptoir, tranchage, tiges d'assemblage, numérotation, vue 3D | Premier meuble en lames |
| **4. Enrichissement** | Eau OSM + mode ville, gravure courbes fines, IGN haute résolution, découpes booléennes dans les lames, gaufrage + dogbones, nesting vrai-forme | Qualité « produit fini » |
| **5. Bonus** | Import STL, plan de montage PDF, G-code simple, presets partageables par lien, mode hors-ligne (PWA) | — |

Chaque phase est livrable et utilisable seule.

---

## 7. Décisions à prendre

1. **Par quel module commencer ?** (proposition : Topo, le mieux défini, puis Atelier, puis Lames)
2. **Ta machine** : surface de travail, diamètres de fraise habituels, logiciel de FAO utilisé (pour tester l'import DXF).
3. **Tes matériaux** : épaisseurs et formats de panneaux courants, prix → bibliothèque par défaut.
4. **Langue** : interface en français uniquement, ou FR + EN dès le départ ?
5. **Nom du dépôt GitHub** et compte : `WoodyDXF` sur ton compte → URL `https://<compte>.github.io/WoodyDXF/`.
