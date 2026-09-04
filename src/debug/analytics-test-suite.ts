/**
 * Suite de tests pour Firebase Analytics
 * Permet de tester différents scénarios d'envoi d'événements
 */

import { analytics, EventCategory, EventAction } from '../services/firebaseAnalytics';
import { forceSendEvent, forceSendPageView, forceSendUserInteraction } from './analytics-force-sender';
import { runAndLogDiagnostics } from './analytics-diagnostics';

/**
 * Exécute une série de tests d'envoi d'événements
 */
export const runAnalyticsTestSuite = async () => {
  console.group('🧪 Suite de tests Firebase Analytics');
  console.log('Démarrage des tests...');
  
  // Exécuter le diagnostic d'abord
  console.log('1. Exécution du diagnostic...');
  const diagnosticResults = await runAndLogDiagnostics();
  
  // Si des problèmes sont détectés, afficher un avertissement
  if (diagnosticResults.summary.failure > 0) {
    console.warn(`⚠️ ${diagnosticResults.summary.failure} problème(s) détecté(s). Certains tests pourraient échouer.`);
  }
  
  // Tester différents types d'événements
  console.log('\n2. Test des événements standards...');
  
  // Test 1: Page view
  try {
    analytics.trackPageView('/test-page', 'Page de test');
    console.log('✅ Test 1: Page view envoyé');
  } catch (error) {
    console.error('❌ Test 1: Échec de l\'envoi de page view', error);
  }
  
  // Test 2: Interaction utilisateur
  try {
    analytics.trackInteraction(EventAction.CLICK, 'test-button', { button_id: 'test-123' });
    console.log('✅ Test 2: Interaction utilisateur envoyée');
  } catch (error) {
    console.error('❌ Test 2: Échec de l\'envoi d\'interaction', error);
  }

  
  // Test 4: Événement de carte
  try {
    analytics.trackMapInteraction(EventAction.MAP_LOAD, { map_type: 'test' });
    console.log('✅ Test 4: Événement de carte envoyé');
  } catch (error) {
    console.error('❌ Test 4: Échec de l\'envoi d\'événement de carte', error);
  }
  
  // Test 5: Événement d'erreur
  try {
    analytics.trackError(EventAction.API_ERROR, 'Test error message', { error_code: 'TEST-404' });
    console.log('✅ Test 5: Événement d\'erreur envoyé');
  } catch (error) {
    console.error('❌ Test 5: Échec de l\'envoi d\'événement d\'erreur', error);
  }
  
  // Attendre un peu avant de passer aux méthodes de force
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('\n3. Test des méthodes de force d\'envoi...');
  
  // Test 6: Force send event
  try {
    forceSendEvent('force_test_event', { test_param: 'test_value' });
    console.log('✅ Test 6: Force send event envoyé');
  } catch (error) {
    console.error('❌ Test 6: Échec du force send event', error);
  }
  
  // Test 7: Force send page view
  try {
    forceSendPageView('/force-test-page', 'Force Test Page');
    console.log('✅ Test 7: Force send page view envoyé');
  } catch (error) {
    console.error('❌ Test 7: Échec du force send page view', error);
  }
  
  // Test 8: Force send user interaction
  try {
    forceSendUserInteraction('force_click', 'force-test-button');
    console.log('✅ Test 8: Force send user interaction envoyé');
  } catch (error) {
    console.error('❌ Test 8: Échec du force send user interaction', error);
  }
  
  console.log('\n4. Vérification des événements dans DebugView');
  console.log('Veuillez vérifier la console Firebase DebugView pour confirmer la réception des événements.');
  console.log('URL: https://console.firebase.google.com/project/_/analytics/debugview');
  
  console.log('\nTests terminés. Vérifiez la console Firebase pour confirmer la réception des événements.');
  console.groupEnd();
};

/**
 * Exécute un test spécifique d'envoi d'événement
 */
export const runSpecificTest = (testName: string) => {
  console.log(`Exécution du test: ${testName}`);
  
  switch (testName) {
    case 'page_view':
      analytics.trackPageView('/specific-test-page', 'Page de test spécifique');
      break;
    case 'click':
      analytics.trackInteraction(EventAction.CLICK, 'specific-test-button', { button_id: 'specific-123' });
      break;
    case 'map':
      analytics.trackMapInteraction(EventAction.MAP_LOAD, { map_type: 'specific-test' });
      break;
    case 'error':
      analytics.trackError(EventAction.API_ERROR, 'Specific test error message', { error_code: 'SPECIFIC-404' });
      break;
    case 'force':
      forceSendEvent('specific_force_test', { test_param: 'specific_value' });
      break;
    default:
      console.warn(`Test inconnu: ${testName}`);
  }
  
  console.log(`Test ${testName} exécuté. Vérifiez la console Firebase.`);
};

/**
 * Exécute une série de tests rapides
 */
export const runQuickTests = () => {
  // Envoyer rapidement plusieurs événements différents
  analytics.trackPageView('/quick-test', 'Test rapide');
  analytics.trackInteraction(EventAction.CLICK, 'quick-button', { quick: true });
  analytics.trackFeatureUse('quick-feature', { quick: true });
  forceSendEvent('quick_test', { method: 'quick' });
  
  console.log('Tests rapides exécutés. Vérifiez la console Firebase.');
};

