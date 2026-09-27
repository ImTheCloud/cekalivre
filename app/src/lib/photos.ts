import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

/**
 * Les photos de colis restent sur le téléphone (dossier "documents" de l'app) :
 * gratuit, instantané, et utilisable sans réseau pendant la tournée.
 * On ne stocke que le nom du fichier, car le chemin complet peut changer après une mise à jour de l'app (iOS).
 */
const PHOTO_QUALITY = 0.5;

function photosDir(): Directory {
  return new Directory(Paths.document, 'photos');
}

export function photoUri(name: string): string {
  return new File(photosDir(), name).uri;
}

async function persist(sourceUri: string): Promise<string> {
  const dir = photosDir();
  dir.create({ idempotent: true, intermediates: true });
  const extension = sourceUri.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg';
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  await new File(sourceUri).copy(new File(dir, name));
  return name;
}

/** Ouvre l'appareil photo et renvoie le nom du fichier enregistré (null si annulé). */
export async function takeParcelPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error("L'accès à l'appareil photo est refusé. Autorise-le dans les réglages du téléphone.");
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: PHOTO_QUALITY });
  if (result.canceled || !result.assets?.length) return null;
  return persist(result.assets[0].uri);
}

/** Choisit une photo existante dans la galerie. */
export async function pickParcelPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: PHOTO_QUALITY,
  });
  if (result.canceled || !result.assets?.length) return null;
  return persist(result.assets[0].uri);
}

export function deletePhoto(name: string | null | undefined): void {
  if (!name) return;
  try {
    const file = new File(photosDir(), name);
    if (file.exists) file.delete();
  } catch {
    // Une photo introuvable n'est pas bloquante.
  }
}

/** Supprime toutes les photos (appelé au démarrage d'une nouvelle tournée). */
export function deleteAllPhotos(): void {
  try {
    const dir = photosDir();
    if (dir.exists) dir.delete();
  } catch {
    // idem
  }
}
