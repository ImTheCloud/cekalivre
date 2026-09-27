# Déploiement gratuit

Objectif : utiliser l'app pendant de vraies tournées, sur le réseau mobile, sans dépenser d'argent.
Il faut pour cela :

1. un **serveur** accessible depuis Internet, qui fait tourner le backend et OSRM (carte de Belgique) ;
2. une **adresse HTTPS**, obligatoire pour une app installée ;
3. une **build de l'app** installée sur le téléphone. Expo Go suffit aussi pour commencer.

---

## Étape 0 — Tester sans serveur (tout de suite)

Tant que le Mac est allumé et sur le même Wi-Fi que le téléphone, le démarrage rapide du [README](../README.md) suffit.
Pour tester en tournée (4G) sans serveur, tu peux exposer temporairement le backend du Mac avec un tunnel gratuit :

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:8000     # affiche une URL https://xxxx.trycloudflare.com
```

Mets ensuite cette URL dans `app/.env.local` (`EXPO_PUBLIC_API_URL=https://xxxx.trycloudflare.com`) et relance `npx expo start`.
L'URL change à chaque lancement du tunnel. C'est pratique pour un essai, pas pour tous les jours.

---

## Étape 1 — Serveur gratuit : Oracle Cloud « Always Free »

Oracle offre à vie une machine ARM avec jusqu'à 4 cœurs et 24 Go de RAM. C'est largement assez pour OSRM Belgique, qui demande environ 6 Go pendant la préparation et 1 à 2 Go ensuite.

1. Crée un compte sur https://www.oracle.com/cloud/free/. Une carte bancaire est demandée pour vérifier ton identité ; rien n'est débité tant que tu restes sur les ressources « Always Free ». Choisis une région proche, par exemple Amsterdam ou Frankfurt.
2. **Compute → Instances → Create instance** :
   - Image : **Ubuntu 24.04** ;
   - Shape : **Ampere – VM.Standard.A1.Flex**, 2 OCPU et 12 Go de RAM ;
   - télécharge la clé SSH proposée.

   Si le message « Out of capacity » apparaît, réessaie plus tard ou dans un autre « availability domain ».
3. **Ouvre les ports 80 et 443** :
   - dans Oracle : Networking → Virtual Cloud Networks → ton VCN → Security List → *Add Ingress Rules*, source `0.0.0.0/0`, ports TCP `80` et `443` ;
   - sur la machine, car les images Ubuntu d'Oracle bloquent tout par défaut :
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```
4. Connecte-toi et installe Docker :
   ```bash
   ssh -i ta-cle.key ubuntu@<IP_PUBLIQUE>
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker ubuntu && exit     # puis reconnecte-toi
   ```

## Étape 2 — Nom de domaine gratuit (DuckDNS)

1. Va sur https://www.duckdns.org et connecte-toi avec GitHub.
2. Crée un sous-domaine, par exemple `cekalivre` (→ `cekalivre.duckdns.org`), et mets l'**IP publique** du serveur.

## Étape 3 — Lancer le backend

```bash
git clone https://github.com/ImTheCloud/cekalivre.git
cd cekalivre/backend
./scripts/prepare-osrm.sh            # 10 à 20 min : télécharge et prépare la carte de Belgique
cp .env.example .env
nano .env                            # voir ci-dessous
docker compose --profile https up -d --build
```

Dans `.env` :

```
API_TOKEN=<résultat de : openssl rand -hex 24>
DOMAIN=cekalivre.duckdns.org
API_BIND=127.0.0.1
```

Vérification : `curl https://cekalivre.duckdns.org/health` doit renvoyer `"matrixSource":"osrm"`.

**Mise à jour du code** : `git pull && docker compose --profile https up -d --build`.
**Mise à jour de la carte** (une fois par mois suffit) : `./scripts/prepare-osrm.sh && docker compose restart osrm`.

## Étape 4 — Brancher l'app sur le serveur

Dans `app/.env.local` :

```
EXPO_PUBLIC_API_URL=https://cekalivre.duckdns.org
EXPO_PUBLIC_API_TOKEN=<le même API_TOKEN>
```

Relance `npx expo start`. L'app dans Expo Go fonctionne alors partout, en 4G comme en Wi-Fi.

## Étape 5 — Installer l'app sans Expo Go (build EAS)

Expo Go suffit pour valider la v0. Une build dédiée apporte en plus :
- l'icône Cékalivre sur l'écran d'accueil ;
- l'app ne dépend plus du Mac ;
- Google Maps sur iOS.

1. Crée un compte gratuit sur https://expo.dev, puis :
   ```bash
   cd app
   npx eas-cli@latest login
   npx eas-cli@latest init                        # relie le projet à ton compte Expo
   npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://cekalivre.duckdns.org --visibility plaintext
   npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_TOKEN --value <API_TOKEN> --visibility sensitive
   ```
2. **Clé Google Maps Android**, indispensable pour afficher la carte dans une build Android :
   - https://console.cloud.google.com → nouveau projet → **APIs & Services → Enable APIs** → « Maps SDK for Android ». Google exige un compte de facturation, mais l'affichage de cartes sur mobile natif est gratuit et illimité.
   - **Credentials → Create credentials → API key**, puis restreins-la à *Android apps* avec :
     - le package `be.cekalivre.app` ;
     - l'empreinte SHA-1 affichée par `npx eas-cli@latest credentials` (Android → preview).
   - `npx eas-cli@latest env:create --environment preview --name GOOGLE_MAPS_ANDROID_API_KEY --value <clé> --visibility sensitive`
3. Lance la build :
   ```bash
   npx eas-cli@latest build --profile preview --platform android
   ```
   À la fin, EAS affiche un lien ou un QR code pour installer l'APK directement sur le téléphone.

**iPhone** : installer une build en dehors d'Expo Go demande un compte Apple Developer (99 $/an). Pour la v0 gratuite, reste sur Expo Go ; la carte y utilise Apple Maps.

---

## Coûts

| Élément | Coût |
| --- | --- |
| Oracle Cloud Always Free (serveur + OSRM) | 0 € |
| DuckDNS + Let's Encrypt (HTTPS) | 0 € |
| Photon / Nominatim (géocodage OSM) | 0 € (usage raisonnable, avec cache) |
| Google Maps SDK mobile (affichage carte) + liens de navigation | 0 € |
| EAS Build (offre gratuite, quelques builds par mois) | 0 € |
| Apple Developer (seulement pour une build iPhone) | 99 $/an, optionnel |
