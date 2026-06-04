import React from 'react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Variantes "action" : petits boutons d'icône circulaires avec une couleur sémantique
type ActionVariant = 'like' | 'save' | 'share' | 'calendar' | 'delete' | 'edit' | 'info' | 'bell' | 'trash';
// Variantes "bouton" classiques (avec libellé / children)
type ButtonVariant = 'primary' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';

// Composant ActionButton : supporte deux usages
//  1. Bouton d'icône (prop `icon` + variante d'action) -> petit bouton rond coloré
//  2. Bouton classique avec libellé (`children` + variante primary/outline/...)
interface ActionButtonProps {
  icon?: React.ReactNode;
  children?: React.ReactNode;
  variant?: ActionVariant | ButtonVariant;
  active?: boolean;
  onClick?: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  tooltip?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit' | 'reset';
}

const ACTION_VARIANTS: ActionVariant[] = ['like', 'save', 'share', 'calendar', 'delete', 'edit', 'info', 'bell', 'trash'];

export const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  children,
  variant = 'primary',
  active = false,
  onClick,
  tooltip,
  disabled = false,
  className = '',
  size = 'md',
  // Par défaut "button" pour éviter une soumission accidentelle du formulaire
  // lorsque le bouton est placé à l'intérieur d'un <form>.
  type = 'button'
}) => {
  // Mode "icône" : dès qu'une icône est fournie ou qu'on utilise une variante d'action.
  const isIconMode = icon !== undefined || ACTION_VARIANTS.includes(variant as ActionVariant);

  if (isIconMode) {
    // Couleurs spécifiques par type d'action
    const actionColors: Record<ActionVariant, string> = {
      like: active ? 'text-red-500 hover:text-red-600' : 'text-gray-500 hover:text-red-500',
      save: active ? 'text-blue-500 hover:text-blue-600' : 'text-gray-500 hover:text-blue-500',
      share: 'text-gray-600 hover:text-gray-700',
      calendar: 'text-green-600 hover:text-green-700',
      delete: 'text-red-500 hover:text-red-600',
      edit: 'text-blue-600 hover:text-blue-700',
      info: 'text-[#4a5d94] hover:text-[#3a4d84]',
      bell: 'text-[#4a5d94] hover:text-[#3a4d84]',
      trash: 'text-red-500 hover:text-red-600'
    };

    // Tailles pour les boutons d'action
    const sizeClasses: Record<'sm' | 'md' | 'lg', string> = {
      sm: 'h-6 w-6 p-1',
      md: 'h-8 w-8 p-1.5',
      lg: 'h-10 w-10 p-2'
    };

    return (
      <Button
        type={type}
        variant="ghost"
        size="icon"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        title={tooltip}
        className={cn(
          "rounded-full hover:bg-gray-100 transition-colors",
          sizeClasses[size],
          actionColors[variant as ActionVariant],
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        {icon ?? children}
      </Button>
    );
  }

  // Mode "bouton" classique avec libellé (children)
  const buttonVariantMap: Record<ButtonVariant, 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'> = {
    primary: 'default',
    outline: 'outline',
    secondary: 'secondary',
    ghost: 'ghost',
    destructive: 'destructive',
    link: 'link'
  };

  const sizeMap: Record<'sm' | 'md' | 'lg', 'sm' | 'default' | 'lg'> = {
    sm: 'sm',
    md: 'default',
    lg: 'lg'
  };

  return (
    <Button
      type={type}
      variant={buttonVariantMap[variant as ButtonVariant] ?? 'default'}
      size={sizeMap[size]}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={tooltip}
      className={cn(
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {children}
    </Button>
  );
};

export default ActionButton;
