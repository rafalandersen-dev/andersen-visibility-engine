import type { OnboardingLanguage } from "@/lib/types";
export const imageReferencesCopy: Record<OnboardingLanguage, Record<string, string>> = {
  en: {
    "imageRefs.title": "Product photo references",
    "imageRefs.note":
      "Choose uploaded photos from this saved article to prepare a reference set. Save the article to keep your selection. Checking files does not generate or approve an image.",
    "imageRefs.limits":
      "Choose up to 4 JPEG, PNG or WebP photos: 4 MiB per file, 8 MiB and 8,388,608 pixels total, and no edge longer than 2048 pixels. Animated images are not supported.",
    "imageRefs.savePhotos": "Save your image changes before loading the saved photos.",
    "imageRefs.invalid": "This selection could not be read. Clear it and choose the photos again.",
    "imageRefs.load": "Load saved photos",
    "imageRefs.clear": "Clear photo selection",
    "imageRefs.loading": "Loading saved photos…",
    "imageRefs.loadError": "Saved photos could not be loaded. Save the article, then try again.",
    "imageRefs.empty": "No uploaded photos are available in this saved article.",
    "imageRefs.changed":
      "A selected photo has changed or been removed. Clear the selection and choose the current photos again.",
    "imageRefs.selected": "{count} photos selected. Save the article to keep this selection.",
    "imageRefs.check": "Check selected photos",
    "imageRefs.unavailable":
      "Generation with product photos is not available yet. Clear the photo selection to generate from the description only.",
    "imageRefs.checking": "Checking the selected files…",
    "imageRefs.checkError":
      "The photos could not be checked. Reload the saved photos and try again.",
    "imageRefs.checked":
      "The selected files passed the file and size checks at this time. This does not verify visual quality or product accuracy.",
    "imageRefs.file": "Photo {index}: {width} × {height} pixels, {size} KiB",
  },
  pl: {
    "imageRefs.title": "Zdjęcia referencyjne produktu",
    "imageRefs.note":
      "Wybierz przesłane zdjęcia z zapisanego artykułu, aby przygotować zestaw referencyjny. Zapisz artykuł, aby zachować wybór. Sprawdzenie plików nie generuje ani nie zatwierdza obrazu.",
    "imageRefs.limits":
      "Wybierz do 4 zdjęć JPEG, PNG lub WebP: maksymalnie 4 MiB na plik, łącznie 8 MiB i 8 388 608 pikseli oraz 2048 pikseli na każdym boku. Obrazy animowane nie są obsługiwane.",
    "imageRefs.savePhotos": "Zapisz zmiany obrazów przed wczytaniem zapisanych zdjęć.",
    "imageRefs.invalid": "Nie można odczytać tego wyboru. Wyczyść go i wybierz zdjęcia ponownie.",
    "imageRefs.load": "Wczytaj zapisane zdjęcia",
    "imageRefs.clear": "Wyczyść wybór zdjęć",
    "imageRefs.loading": "Wczytywanie zapisanych zdjęć…",
    "imageRefs.loadError": "Nie można wczytać zapisanych zdjęć. Zapisz artykuł i spróbuj ponownie.",
    "imageRefs.empty": "W zapisanym artykule nie ma przesłanych zdjęć.",
    "imageRefs.changed":
      "Wybrane zdjęcie zostało zmienione lub usunięte. Wyczyść wybór i wybierz aktualne zdjęcia ponownie.",
    "imageRefs.selected": "Wybrano zdjęć: {count}. Zapisz artykuł, aby zachować wybór.",
    "imageRefs.check": "Sprawdź wybrane zdjęcia",
    "imageRefs.unavailable":
      "Generowanie ze zdjęciami produktów nie jest jeszcze dostępne. Wyczyść wybór zdjęć, aby wygenerować obraz tylko na podstawie opisu.",
    "imageRefs.checking": "Sprawdzanie wybranych plików…",
    "imageRefs.checkError":
      "Nie można sprawdzić zdjęć. Wczytaj zapisane zdjęcia i spróbuj ponownie.",
    "imageRefs.checked":
      "Wybrane pliki przeszły teraz kontrolę plików i rozmiaru. Nie potwierdza to jakości obrazu ani zgodności z produktem.",
    "imageRefs.file": "Zdjęcie {index}: {width} × {height} pikseli, {size} KiB",
  },
  sv: {
    "imageRefs.title": "Referensbilder på produkten",
    "imageRefs.note":
      "Välj uppladdade foton från den sparade artikeln för att förbereda en referensuppsättning. Spara artikeln för att behålla ditt val. Filkontrollen skapar eller godkänner ingen bild.",
    "imageRefs.limits":
      "Välj upp till 4 JPEG-, PNG- eller WebP-foton: 4 MiB per fil, totalt 8 MiB och 8 388 608 pixlar samt högst 2048 pixlar per sida. Animerade bilder stöds inte.",
    "imageRefs.savePhotos": "Spara bildändringarna innan du läser in sparade foton.",
    "imageRefs.invalid": "Valet kunde inte läsas. Rensa det och välj fotona igen.",
    "imageRefs.load": "Läs in sparade foton",
    "imageRefs.clear": "Rensa fotovalet",
    "imageRefs.loading": "Läser in sparade foton…",
    "imageRefs.loadError": "Sparade foton kunde inte läsas in. Spara artikeln och försök igen.",
    "imageRefs.empty": "Det finns inga uppladdade foton i den sparade artikeln.",
    "imageRefs.changed":
      "Ett valt foto har ändrats eller tagits bort. Rensa valet och välj de aktuella fotona igen.",
    "imageRefs.selected": "{count} foton valda. Spara artikeln för att behålla valet.",
    "imageRefs.check": "Kontrollera valda foton",
    "imageRefs.unavailable":
      "Bildgenerering med produktfoton är ännu inte tillgänglig. Rensa fotovalet för att skapa en bild enbart från beskrivningen.",
    "imageRefs.checking": "Kontrollerar de valda filerna…",
    "imageRefs.checkError": "Fotona kunde inte kontrolleras. Läs in sparade foton och försök igen.",
    "imageRefs.checked":
      "De valda filerna klarade fil- och storlekskontrollen vid detta tillfälle. Det bekräftar inte bildkvalitet eller produktens utseende.",
    "imageRefs.file": "Foto {index}: {width} × {height} pixlar, {size} KiB",
  },
  da: {
    "imageRefs.title": "Referencebilleder af produktet",
    "imageRefs.note":
      "Vælg uploadede fotos fra den gemte artikel for at forberede et referencesæt. Gem artiklen for at bevare dit valg. Filkontrollen genererer eller godkender ikke et billede.",
    "imageRefs.limits":
      "Vælg op til 4 JPEG-, PNG- eller WebP-fotos: 4 MiB pr. fil, i alt 8 MiB og 8.388.608 pixels samt højst 2048 pixels på hver side. Animerede billeder understøttes ikke.",
    "imageRefs.savePhotos": "Gem billedændringerne, før du indlæser gemte fotos.",
    "imageRefs.invalid": "Valget kunne ikke læses. Ryd det, og vælg billederne igen.",
    "imageRefs.load": "Indlæs gemte fotos",
    "imageRefs.clear": "Ryd fotovalget",
    "imageRefs.loading": "Indlæser gemte fotos…",
    "imageRefs.loadError": "Gemte fotos kunne ikke indlæses. Gem artiklen, og prøv igen.",
    "imageRefs.empty": "Der er ingen uploadede fotos i den gemte artikel.",
    "imageRefs.changed":
      "Et valgt foto er ændret eller fjernet. Ryd valget, og vælg de aktuelle fotos igen.",
    "imageRefs.selected": "{count} fotos valgt. Gem artiklen for at bevare valget.",
    "imageRefs.check": "Kontrollér valgte fotos",
    "imageRefs.unavailable":
      "Billedgenerering med produktfotos er endnu ikke tilgængelig. Ryd fotovalget for at generere et billede ud fra beskrivelsen alene.",
    "imageRefs.checking": "Kontrollerer de valgte filer…",
    "imageRefs.checkError": "Billederne kunne ikke kontrolleres. Indlæs gemte fotos, og prøv igen.",
    "imageRefs.checked":
      "De valgte filer bestod fil- og størrelseskontrollen på dette tidspunkt. Det bekræfter ikke billedkvalitet eller produktets udseende.",
    "imageRefs.file": "Foto {index}: {width} × {height} pixels, {size} KiB",
  },
};
