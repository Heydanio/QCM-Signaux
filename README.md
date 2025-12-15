# Veille Électrique

Prototype web entièrement original mêlant surveillance nocturne et gestion d'énergie. Ouvrez simplement `index.html` dans un navigateur moderne pour jouer (aucun serveur ni dépendance externe).

## Lancer
- Télécharger ou cloner le dossier.
- Ouvrir `index.html` dans un navigateur desktop ou mobile.

## Contrôles
- **Q / bouton Blindage gauche** : activer/désactiver la barrière gauche.
- **S / bouton Blindage droit** : activer/désactiver la barrière droite.
- **A / bouton Lampe gauche** : activer/désactiver la lampe gauche.
- **D / bouton Lampe droite** : activer/désactiver la lampe droite. (Shift+D active le debug pour éviter les conflits)
- **E / bouton Panneau caméras** : ouvrir/fermer le panneau caméras.
- **Espace** : avancer après victoire/défaite.
- **F** : accélération temporelle (debug).
- **X** : réinitialiser la nuit courante (debug rapide).
- **Shift + D** : activer le panneau debug (états IA, énergie, timers).

Touches et boutons sont doublés pour faciliter la jouabilité mobile.

## Boucle de jeu
- Chaque nuit dure 6 minutes (360 s par défaut, configurable dans Options).
- Consommation d'énergie : drain passif + coût des actions (portes, lumières, caméras). À 0%, toutes les défenses s'arrêtent et l'ennemi agressif devient très menaçant.
- Survivre de 00:00 à 06:00. Défendez le bureau via les deux barrières et les deux lampes.
- Trois ennemis originaux avec IA distinctes :
  - **Errant-8 (patrouilleur)** : progresse par probabilités croissantes selon la nuit.
  - **Guette-scan (opportuniste)** : avance plus vite quand vous restez longtemps sur les caméras.
  - **Choc-Sentinelle (agressif)** : se nourrit de vos actions (portes/lumières) et du manque d'énergie.
- Système de caméras (7 zones) affichant une vue stylisée et des silhouettes. Utiliser l'énergie avec parcimonie.
- Victoire : terminer une nuit. Après la nuit 5, écran final.
- Défaite : un ennemi atteint le bureau avec barrière ouverte.

## Options & accessibilité
- Durée de nuit ajustable (60 à 360s).
- Option **Réduire les flashs** pour atténuer les effets lumineux.
- UI à fort contraste, boutons larges sur mobile.

## Architecture
- **index.html** : structure DOM, menus, boutons et canvas principal.
- **styles.css** : mise en page responsive, panneaux (menu, caméras, états), grain visuel.
- **game.js** : logique de jeu, machine à états, IA ennemie, boucle de rendu canvas, gestion énergie.
- **audio.js** : WebAudio minimal (bips, alertes) sans assets externes.

### États
- `MENU`, `PLAY`, `WIN`, `GAMEOVER`, `TRANSITION`.

### Données clés
- RNG seedable (`RNG` basé xorshift32) pour rendre les runs reproductibles via la seed affichée en debug.
- Ennemi = `name`, `color`, `path` (zones de caméra), `position`, `cooldown`.
- Caméras : tableau de zones avec texte contextuel et mise en surbrillance sur panneau.

## Remplacer les assets plus tard
- Visuels : remplacer les formes Canvas par des images en dessinant dans `drawCameraView` / `render`.
- Sons : adapter les fonctions de `audio.js` pour jouer vos propres fichiers (ou buffers) en gardant les signatures.
- Ajouts UI : menus, transitions, etc. sont pilotés par le DOM; les IDs existants facilitent le remplacement.

## Débogage
- Appuyer sur **Shift + D** pour afficher le panneau debug (positions ennemies, énergie, timers).
- Accélération temporelle avec **F** pour tester rapidement la progression.
- Variable `game.rng.seed` consultable en console pour rejouer un run similaire.
