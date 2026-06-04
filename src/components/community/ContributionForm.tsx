import React, { useState, useRef, useEffect } from "react";
import Camera from "lucide-react/dist/esm/icons/camera";
import Upload from "lucide-react/dist/esm/icons/upload";
import Loader2 from "lucide-react/dist/esm/icons/loader-2";
import Info from "lucide-react/dist/esm/icons/info";
import CheckCircle from "lucide-react/dist/esm/icons/check-circle";
import Clock from "lucide-react/dist/esm/icons/clock";
import Zap from "lucide-react/dist/esm/icons/zap";
import { motion } from "framer-motion";
import { useForm, useWatch } from "react-hook-form";

import { ActionButton } from "../../components/ui/ActionButton";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Label } from "../../components/ui/label";
import { RadioGroup, RadioGroupItem } from "../../components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Progress } from "../../components/ui/progress";
import { toast } from "../../components/ui/use-toast";

import { CommunityEntry, EntryType, SubmissionParams, ModerationResult } from "../../types/communityTypes";
import { submitContribution } from "../../services/cloudinaryService";
import { AnonymousSessionService } from "../../services/anonymousSessionService";
import { getContributionContext, clearContributionContext, enrichSubmissionWithContext } from "../../services/contextualContributionService";
import { events } from "../../data/events";
import { locations } from "../../data/locations";
import { analytics, EventAction } from "@/services/firebaseAnalytics";
import { compressImage, validateImageFile, formatFileSize, CompressionResult } from "../../utils/imageCompression";
import { useAutoSave } from "../../hooks/useAutoSave";

interface ContributionFormProps {
  onSubmit: (newEntry: CommunityEntry) => void;
}

export const ContributionForm: React.FC<ContributionFormProps> = ({ onSubmit }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [contributionContext, setContributionContext] = useState<{ type?: string; name?: string; [k: string]: unknown } | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [compressionResult, setCompressionResult] = useState<CompressionResult | null>(null);
  const [showDraftNotification, setShowDraftNotification] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, setValue, formState: { errors }, control } = useForm<SubmissionParams>();
  
  // Surveiller les changements du formulaire pour l'auto-save
  const watchedFields = useWatch({ control });
  
  // Auto-save hook
  const { loadDraft, clearDraft, hasDraft } = useAutoSave({
    key: 'contribution_form',
    data: {
      ...watchedFields,
      selectedEventId,
      selectedLocationId,
      imagePreview: imagePreview ? 'has_image' : null // Ne pas sauvegarder l'image elle-même
    },
    delay: 2000, // Sauvegarder 2 secondes après la dernière modification
    enabled: !isSubmitted // Désactiver après soumission
  });

  // Récupérer le brouillon au chargement
  useEffect(() => {
    const draft = loadDraft();
    if (draft && hasDraft()) {
      setShowDraftNotification(true);
    }
  }, [loadDraft, hasDraft]);
  
  // Récupérer le contexte de contribution au chargement
  useEffect(() => {
    const context = getContributionContext();
    if (context) {
      setContributionContext(context);
      console.log("[ContributionForm] Contexte reçu:", context);
      
      // Pré-remplir les champs du formulaire en fonction du contexte
      if (context.type === "event") {
        // Pré-remplir l'événement
        setValue("eventId", context.id);
        setSelectedEventId(context.id);
        console.log("[ContributionForm] Contexte événement défini:", context.id);
        console.log("[ContributionForm] Liste des événements disponibles:", events.map(e => e.id));
        console.log("[ContributionForm] L'ID de l'événement est-il dans la liste ?", events.some(e => e.id === context.id));
        
        // Si l'événement a un lieu associé, pré-remplir également le lieu
        if (context.locationId) {
          setValue("locationId", context.locationId);
          setSelectedLocationId(context.locationId);
          console.log("[ContributionForm] Lieu associé à l'événement pré-rempli:", context.locationId);
          console.log("[ContributionForm] Le lieu associé est-il dans la liste ?", locations.some(l => l.id === context.locationId));
        }
      } else if (context.type === "location") {
        // Pré-remplir le lieu
        setValue("locationId", context.id);
        setSelectedLocationId(context.id);
        console.log("[ContributionForm] Contexte lieu défini:", context.id);
        console.log("[ContributionForm] Liste des lieux disponibles:", locations.map(l => l.id));
        console.log("[ContributionForm] L'ID du lieu est-il dans la liste ?", locations.some(l => l.id === context.id));
        
        // Vérifier si le lieu existe dans la liste
        const locationExists = locations.some(l => l.id === context.id);
        if (!locationExists) {
          console.warn("[ContributionForm] ATTENTION: L'ID du lieu dans le contexte ne correspond à aucun lieu disponible dans la liste déroulante");
        }
      }
    }
    // Analytics: user opened contribution form
    analytics.trackCommunityInteraction(EventAction.CONTRIBUTION, { stage: 'open_form' });
  }, [setValue]);

  // Gérer le changement d'image avec compression
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('🔥 [handleImageChange] FONCTION APPELÉE !', e.target.files?.length, 'fichier(s)');
    
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validation du fichier
      const validation = validateImageFile(file);
      if (!validation.valid) {
        alert(validation.error);
        return;
      }

      console.log('[ContributionForm] Début compression:', file.name, formatFileSize(file.size));
      setIsCompressing(true);
      setCompressionProgress(0);

      // Simulation de progression pour l'UX
      const progressInterval = setInterval(() => {
        setCompressionProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      try {
        // Compression de l'image
        const compressionResult = await compressImage(file, {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 0.8,
          format: 'jpeg',
          maxSizeKB: 1024 // 1MB max après compression
        });

        clearInterval(progressInterval);
        setCompressionProgress(100);
        setCompressionResult(compressionResult);

        console.log('[ContributionForm] Compression terminée:', {
          original: formatFileSize(compressionResult.originalSize),
          compressed: formatFileSize(compressionResult.compressedSize),
          ratio: compressionResult.compressionRatio + '%',
          dimensions: `${compressionResult.width}x${compressionResult.height}`
        });

        // Créer un aperçu local immédiatement
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target && event.target.result) {
            setImagePreview(event.target.result as string);
          }
        };
        reader.readAsDataURL(compressionResult.file);

        // 🌩️ CLOUDINARY: Upload vers Cloudinary avec l'image compressée
        const formData = new FormData();
        formData.append('file', compressionResult.file);
        formData.append('upload_preset', 'collectif_photos');
        formData.append('cloud_name', 'dpatqkgsc');

        console.log('[ContributionForm] Requête Cloudinary avec image compressée:', {
          url: 'https://api.cloudinary.com/v1_1/dpatqkgsc/image/upload',
          preset: 'collectif_photos',
          fileSize: compressionResult.compressedSize,
          fileType: compressionResult.file.type
        });

        const response = await fetch(
          'https://api.cloudinary.com/v1_1/dpatqkgsc/image/upload',
          {
            method: 'POST',
            body: formData,
          }
        );

        console.log('[ContributionForm] Cloudinary response status:', response.status, response.statusText);
        
        if (response.ok) {
          const data = await response.json();
          console.log('[ContributionForm] Cloudinary response data:', data);
          setValue('imageUrl', data.secure_url);
          
          // Analytics: successful image upload
          analytics.trackCommunityInteraction(EventAction.CONTRIBUTION, { 
            stage: 'image_uploaded',
            compression_ratio: compressionResult.compressionRatio,
            original_size: compressionResult.originalSize,
            compressed_size: compressionResult.compressedSize
          });
        } else {
          const errorData = await response.text();
          console.error('[ContributionForm] Erreur Cloudinary:', errorData);
          throw new Error(`Erreur Cloudinary: ${response.status}`);
        }

      } catch (compressionError) {
        clearInterval(progressInterval);
        console.error('[ContributionForm] Erreur de compression:', compressionError);
        alert('Erreur lors de la compression de l\'image. Veuillez réessayer.');
      }

    } catch (error) {
      console.error('[ContributionForm] Erreur générale:', error);
      alert('Erreur lors du traitement de l\'image. Veuillez réessayer.');
    } finally {
      setIsCompressing(false);
      setCompressionProgress(0);
    }
  };

  // Soumettre le formulaire
  const processSubmit = async (data: SubmissionParams) => {
    console.log('[ContributionForm] === DÉBUT DE SOUMISSION ===');
    console.log('[ContributionForm] Données reçues du formulaire:', data);
    
    try {
      setIsSubmitting(true);
      console.log('[ContributionForm] État de soumission activé');
      // Analytics: contribution submit start
      analytics.trackCommunityInteraction(EventAction.CONTRIBUTION, { stage: 'submit_start' });

      // Déterminer le type de contribution automatiquement
      const hasImage = data.imageUrl || fileInputRef.current?.files?.[0];
      const type: EntryType = hasImage ? "photo" : "testimonial";
      console.log('[ContributionForm] Type déterminé automatiquement:', type, hasImage ? '(avec image)' : '(sans image)');

      // Ajouter le type aux données
      data.type = type;

      // Log de l'URL Cloudinary si présente
      if (data.imageUrl) {
        console.log('[ContributionForm] URL Cloudinary disponible:', data.imageUrl);
      } else {
        console.log('[ContributionForm] Aucune URL Cloudinary disponible');
      }

      // Enrichir les données avec le contexte si présent
      console.log('[ContributionForm] Contexte avant enrichissement:', contributionContext);
      data = enrichSubmissionWithContext(data);
      console.log('[ContributionForm] Données après enrichissement avec contexte:', data);

      // Modérer le contenu avant soumission
      console.log('[ContributionForm] Appel du service de soumission...');
      // Soumettre la contribution
      const newEntry = await submitContribution(data);
      console.log('[ContributionForm] Contribution soumise avec succès:', newEntry);
      // Analytics: contribution submit success
      analytics.trackCommunityInteraction(EventAction.CONTRIBUTION, { stage: 'success', entry_id: newEntry.id, type: newEntry.type });
      
      // Toast simple
      toast({
        title: "Contribution ajoutée",
        description: "Votre contribution est maintenant visible.",
      });
      
      // Afficher le message de succès
      setIsSubmitted(true);
      
      // Réinitialiser le formulaire après un délai
      setTimeout(() => {
        console.log('[ContributionForm] Réinitialisation du formulaire...');
        reset();
        setImagePreview(null);
        clearContributionContext();
        setContributionContext(null);
        setSelectedEventId("");
        setSelectedLocationId("");
        setIsSubmitted(false);
        console.log('[ContributionForm] Formulaire réinitialisé');
      }, 5000); // Afficher le message pendant 5 secondes
      
      // Notifier le parent
      console.log('[ContributionForm] Notification du composant parent...');
      onSubmit(newEntry);
      console.log('[ContributionForm] === SOUMISSION TERMINÉE AVEC SUCCÈS ===');
      
    } catch (error) {
      console.error("[ContributionForm] === ERREUR LORS DE LA SOUMISSION ===");
      console.error("[ContributionForm] Erreur détaillée:", error);
      console.error("[ContributionForm] Stack trace:", error instanceof Error ? error.stack : 'N/A');
      // Gérer l'erreur (pourrait être amélioré avec un système de notification)
      alert("Une erreur est survenue lors de l'envoi de votre contribution. Veuillez réessayer.");
      // Analytics: contribution submit failure
      analytics.trackCommunityInteraction(EventAction.CONTRIBUTION, { stage: 'failure' });
    } finally {
      setIsSubmitting(false);
      console.log('[ContributionForm] État de soumission désactivé');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-20"
    >
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Partagez votre expérience</h2>
        <p className="text-sm text-slate-500">
          Contribuez à la mémoire collective de l'île Feydeau en partageant vos photos et témoignages.
        </p>
        
        {/* Message de succès après soumission */}
        {isSubmitted && (
          <Alert className="mt-4 bg-blue-50 border-blue-300 border-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <AlertDescription className="space-y-3">
              <div className="font-bold text-blue-900 text-lg">
                📤 Contribution envoyée !
              </div>
              <div className="bg-blue-100 p-3 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 text-blue-800 font-medium">
                  <Clock className="h-4 w-4" />
                  <span>⏱️ Votre photo sera visible dans 1-2 minutes</span>
                </div>
                <div className="text-sm text-blue-700 mt-1">
                  Le temps que notre système traite automatiquement votre contribution
                </div>
              </div>
              <div className="text-sm text-blue-600">
                ✨ Merci de contribuer à la mémoire collective de l'île Feydeau !
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Afficher le contexte de contribution s'il existe */}
        {contributionContext && !isSubmitted && (
          <Alert className="mt-4 bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-500" />
            <AlertDescription>
              Votre contribution sera associée à {contributionContext.type === "event" ? "l'événement" : "l'emplacement"} <strong>{contributionContext.name}</strong>
            </AlertDescription>
          </Alert>
        )}
      </div>

      {!isSubmitted && (
        <form 
          onSubmit={handleSubmit(processSubmit)} 
          className="space-y-6"
          autoComplete="off"
          data-form-type="contribution"
          noValidate
        >
        {/* Upload d'image - EN PREMIER */}
        <div className="space-y-2">
          <Label htmlFor="image">Photo</Label>
          {imagePreview ? (
            <div className="border-2 border-dashed rounded-lg p-4 text-center">
              <div className="relative">
                <img 
                  src={imagePreview} 
                  alt="Aperçu" 
                  className="max-h-64 mx-auto rounded" 
                />
                <ActionButton 
                  variant="outline" 
                  size="sm" 
                  className="mt-2"
                  onClick={() => {
                    setImagePreview(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                >
                  Changer l'image
                </ActionButton>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed rounded-lg p-4 text-center">
              <div className="py-4 flex flex-col items-center gap-4">
                <Upload className="h-8 w-8 text-slate-400" />
                <p className="text-sm text-slate-500 mb-2">
                  Choisissez comment ajouter votre photo
                </p>
                
                {/* Boutons pour mobile */}
                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                  <ActionButton
                    variant="outline"
                    className="flex-1 flex items-center gap-2"
                    onClick={() => {
                      // Créer un input temporaire pour l'appareil photo
                      const cameraInput = document.createElement('input');
                      cameraInput.type = 'file';
                      cameraInput.accept = 'image/*';
                      cameraInput.capture = 'environment';
                      cameraInput.onchange = (e) => {
                        const event = e as unknown as React.ChangeEvent<HTMLInputElement>;
                        handleImageChange(event);
                      };
                      cameraInput.click();
                    }}
                  >
                    <Camera className="h-4 w-4" />
                    Appareil photo
                  </ActionButton>
                  
                  <ActionButton
                    variant="outline"
                    className="flex-1 flex items-center gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    Galerie
                  </ActionButton>
                </div>
                
                {isCompressing && (
                  <div className="w-full max-w-sm mt-2">
                    <Progress value={compressionProgress} max={100} />
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Input caché pour la galerie */}
          <input 
            type="file" 
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
            data-form-type="contribution-image"
            autoComplete="off"
          />
        </div>

        {/* Description/Texte - APRÈS LA PHOTO */}
        <div className="space-y-2">
          <Label htmlFor="description">Description ou témoignage</Label>
          <Textarea 
            id="description" 
            placeholder="Décrivez votre photo ou partagez votre témoignage..."
            autoComplete="off"
            data-form-type="contribution-description"
            {...register("description")}
          />
        </div>

        {/* Nom d'affichage */}
        <div className="space-y-2">
          <Label htmlFor="displayName">Nom d'affichage (optionnel)</Label>
          <Input 
            id="displayName" 
            placeholder="Votre nom ou pseudonyme"
            defaultValue="Anonyme"
            autoComplete="off"
            data-form-type="contribution-displayname"
            {...register("displayName")}
          />
          <p className="text-xs text-slate-500">
            Laissez vide pour contribuer anonymement
          </p>
        </div>

        {/* Événement associé */}
        <div className="space-y-2">
          <Label htmlFor="eventId">Événement associé (optionnel)</Label>
          <Select 
            value={selectedEventId} 
            onValueChange={(value) => {
              setSelectedEventId(value);
              setValue("eventId", value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez un événement" />
            </SelectTrigger>
            <SelectContent>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>{event.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input 
            type="hidden" 
            {...register("eventId")} 
            value={selectedEventId}
            data-form-type="contribution-event"
            autoComplete="off"
          />
        </div>

        {/* Lieu associé */}
        <div className="space-y-2">
          <Label htmlFor="locationId">Lieu associé (optionnel)</Label>
          <Select 
            value={selectedLocationId} 
            onValueChange={(value) => {
              setSelectedLocationId(value);
              setValue("locationId", value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez un lieu" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input 
            type="hidden" 
            {...register("locationId")} 
            value={selectedLocationId}
            data-form-type="contribution-location"
            autoComplete="off"
          />
        </div>


        {/* Bouton de soumission */}
        <ActionButton 
          variant="primary"
          className="w-full" 
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Envoi en cours...
            </>
          ) : (
            "Partager"
          )}
        </ActionButton>
        </form>
      )}
    </motion.div>
  );
};



