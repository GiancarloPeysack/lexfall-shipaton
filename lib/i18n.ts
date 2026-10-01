// Lightweight i18n scaffold for the app shell (supports the ASO/localization
// growth strategy: ship the UI in ES/PT-BR to widen the funnel cheaply).
// Word CONTENT stays English (that's the product); only chrome/labels localize.
//
// Usage:  import { t } from './i18n';   t('today.header', { done, goal })
// Add a locale by adding a column to STRINGS. Device locale is auto-detected;
// override with setLocale('es').

import { NativeModules, Platform } from 'react-native';

type Locale = 'en' | 'es' | 'pt';

function detectLocale(): Locale {
  let tag = 'en';
  try {
    tag = Platform.OS === 'ios'
      ? (NativeModules.SettingsManager?.settings?.AppleLocale
        || NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
        || 'en')
      : (NativeModules.I18nManager?.localeIdentifier || 'en');
  } catch { /* default en */ }
  const l = tag.toLowerCase();
  if (l.startsWith('es')) return 'es';
  if (l.startsWith('pt')) return 'pt';
  return 'en';
}

let current: Locale = detectLocale();
export function setLocale(l: Locale) { current = l; }
export function getLocale(): Locale { return current; }

// String table. Keep keys stable; fall back to English when a value is missing.
const STRINGS: Record<string, Partial<Record<Locale, string>>> = {
  'common.continue':   { en: 'Continue', es: 'Continuar', pt: 'Continuar' },
  'common.back':       { en: 'Back', es: 'Atrás', pt: 'Voltar' },
  'common.close':      { en: 'Close', es: 'Cerrar', pt: 'Fechar' },
  'common.save':       { en: 'Save', es: 'Guardar', pt: 'Salvar' },
  'tab.today':         { en: 'Today', es: 'Hoy', pt: 'Hoje' },
  'tab.explore':       { en: 'Library', es: 'Biblioteca', pt: 'Biblioteca' },
  'tab.practice':      { en: 'Practice', es: 'Práctica', pt: 'Praticar' },
  'tab.stats':         { en: 'Stats', es: 'Progreso', pt: 'Progresso' },
  'today.inContext':   { en: 'In context', es: 'En contexto', pt: 'Em contexto' },
  'today.of':          { en: 'of', es: 'de', pt: 'de' },
  'field.general':     { en: 'General C1–C2', es: 'General C1–C2', pt: 'Geral C1–C2' },
  'paywall.trial':     { en: '7 days free', es: '7 días gratis', pt: '7 dias grátis' },
  'paywall.access':    { en: 'Full access', es: 'Acceso completo', pt: 'Acesso completo' },
  'paywall.title':     { en: 'Master advanced English', es: 'Domina el inglés avanzado', pt: 'Domine o inglês avançado' },
  'paywall.sub':       { en: 'A new word every day, built for people who already speak well and want to sound exceptional.', es: 'Una palabra nueva cada día, para quienes ya hablan bien y quieren sonar excepcionales.', pt: 'Uma palavra nova por dia, para quem já fala bem e quer soar excepcional.' },
  'paywall.startTrial':{ en: 'Start free trial', es: 'Empezar prueba gratis', pt: 'Iniciar teste grátis' },
  'paywall.wait':      { en: 'Please wait…', es: 'Un momento…', pt: 'Aguarde…' },
  'paywall.autoRenew': { en: 'Subscriptions renew automatically unless canceled at least 24 hours before the current period ends. Payment is charged to your Apple ID. Manage or cancel anytime in your App Store settings.', es: 'Las suscripciones se renuevan automáticamente salvo que se cancelen al menos 24 horas antes de que termine el período actual. El pago se cobra a tu Apple ID. Gestiona o cancela cuando quieras en los ajustes de la App Store.', pt: 'As assinaturas renovam automaticamente, a menos que sejam canceladas pelo menos 24 horas antes do fim do período atual. O pagamento é cobrado no seu Apple ID. Gerencie ou cancele quando quiser nos ajustes da App Store.' },
  'paywall.restore':   { en: 'Restore', es: 'Restaurar', pt: 'Restaurar' },
  'paywall.terms':     { en: 'Terms', es: 'Términos', pt: 'Termos' },
  'paywall.privacy':   { en: 'Privacy', es: 'Privacidad', pt: 'Privacidade' },
  'paywall.bestValue': { en: 'best value', es: 'mejor precio', pt: 'melhor valor' },
  'paywall.save':      { en: 'SAVE {pct}%', es: 'AHORRA {pct}%', pt: 'ECONOMIZE {pct}%' },
  'paywall.perWeek':   { en: '≈ {price}/week', es: '≈ {price}/semana', pt: '≈ {price}/semana' },
  'paywall.perk1':     { en: 'Every field. Medicine, Law, Business and General', es: 'Todas las áreas. Medicina, Derecho, Negocios y General', pt: 'Todas as áreas. Medicina, Direito, Negócios e Geral' },
  'paywall.perk2':     { en: 'The full advanced lexicon, growing every week', es: 'Todo el léxico avanzado, crece cada semana', pt: 'Todo o léxico avançado, crescendo a cada semana' },
  'paywall.perk3':     { en: 'Home-screen & lock-screen widgets', es: 'Widgets para pantalla de inicio y de bloqueo', pt: 'Widgets para tela inicial e tela de bloqueio' },
  'paywall.perk4':     { en: 'Practice games, challenges & spaced review', es: 'Juegos de práctica, retos y repaso espaciado', pt: 'Jogos de prática, desafios e revisão espaçada' },
  'paywall.perk5':     { en: 'Voice pronunciations and your own word lists', es: 'Pronunciaciones en voz y tus propias listas de palabras', pt: 'Pronúncias em áudio e suas próprias listas de palavras' },
  // Core tab chrome
  'common.seeAll':     { en: 'See all', es: 'Ver todo', pt: 'Ver tudo' },
  'today.saved':       { en: 'saved', es: 'guardadas', pt: 'salvas' },
  'explore.library':   { en: 'Your words & areas', es: 'Tus palabras y áreas', pt: 'Suas palavras e áreas' },
  'explore.title':     { en: 'Library', es: 'Biblioteca', pt: 'Biblioteca' },
  'explore.yourWords': { en: 'Your words', es: 'Tus palabras', pt: 'Suas palavras' },
  'explore.searchPlaceholder': { en: 'Search words, meanings, examples', es: 'Busca palabras, significados, ejemplos', pt: 'Busque palavras, significados, exemplos' },
  'practice.focusCategory': { en: 'Focus a category', es: 'Enfoca una categoría', pt: 'Foque uma categoria' },
  'practice.challenges': { en: 'Challenges', es: 'Retos', pt: 'Desafios' },
  'practice.games':    { en: 'Games', es: 'Juegos', pt: 'Jogos' },
  'practice.forYou':   { en: 'For You', es: 'Para ti', pt: 'Para você' },
  'practice.all':      { en: 'All', es: 'Todas', pt: 'Todas' },
  'stats.thisWeek':    { en: 'This week', es: 'Esta semana', pt: 'Esta semana' },
  'stats.proficiency': { en: 'Your proficiency', es: 'Tu nivel', pt: 'Seu nível' },
  'stats.levelByArea': { en: 'Level by area', es: 'Nivel por área', pt: 'Nível por área' },
  'stats.levelByCategory': { en: 'Level by category', es: 'Nivel por categoría', pt: 'Nível por categoria' },
  // Word detail + common
  'common.goBack':     { en: 'Go back', es: 'Volver', pt: 'Voltar' },
  'common.change':     { en: 'Change', es: 'Cambiar', pt: 'Alterar' },
  'word.origin':       { en: 'Origin', es: 'Origen', pt: 'Origem' },
  'word.unlockCta':    { en: 'Unlock Lexfall', es: 'Desbloquea Lexfall', pt: 'Desbloqueie o Lexfall' },
  'word.lockSub':      { en: 'Unlock the full definition, example and origin - plus every other advanced word.', es: 'Desbloquea la definición completa, el ejemplo y el origen, y todas las demás palabras avanzadas.', pt: 'Desbloqueie a definição completa, o exemplo e a origem — e todas as outras palavras avançadas.' },
  // Profile / settings
  'profile.customize': { en: 'Customize the app', es: 'Personaliza la app', pt: 'Personalize o app' },
  'profile.field':     { en: 'Field', es: 'Campo', pt: 'Área' },
  'profile.dailyGoal': { en: 'Daily goal', es: 'Meta diaria', pt: 'Meta diária' },
  'profile.appearance':{ en: 'Appearance', es: 'Apariencia', pt: 'Aparência' },
  'profile.accent':    { en: 'Accent', es: 'Color de acento', pt: 'Cor de destaque' },
  'profile.sound':     { en: 'Sound', es: 'Sonido', pt: 'Som' },
  'profile.reminders': { en: 'Reminders', es: 'Recordatorios', pt: 'Lembretes' },
  // Practice hub + test
  'practice.buildTest':   { en: 'Build a test', es: 'Crea un test', pt: 'Monte um teste' },
  'practice.startTest':   { en: 'Start test', es: 'Empezar test', pt: 'Iniciar teste' },
  'practice.yourHistory': { en: 'Your history', es: 'Tu historial', pt: 'Seu histórico' },
  'practice.forYouCap':   { en: 'For you', es: 'Para ti', pt: 'Para você' },
  'practice.level':       { en: 'Level', es: 'Nivel', pt: 'Nível' },
  'practice.length':      { en: 'Length', es: 'Duración', pt: 'Duração' },
  'practice.how':         { en: 'How', es: 'Cómo', pt: 'Como' },
  'practice.loadingTopics': { en: 'Loading topics…', es: 'Cargando temas…', pt: 'Carregando temas…' },
  'game.roundComplete':   { en: 'Round complete', es: 'Ronda completa', pt: 'Rodada concluída' },
  'game.finish':          { en: 'Finish', es: 'Terminar', pt: 'Concluir' },
  'game.reviewThese':     { en: 'Review these', es: 'Repasa estas', pt: 'Revise estas' },
  'game.practiceThese':   { en: 'Practice these {n} words', es: 'Practica estas {n} palabras', pt: 'Pratique estas {n} palavras' },
  'game.cleanSweep':      { en: 'Clean sweep — every answer correct.', es: 'Impecable: todas correctas.', pt: 'Impecável: todas corretas.' },
  'game.estimatedLevel':  { en: 'estimated level', es: 'nivel estimado', pt: 'nível estimado' },
  'game.levelTest':       { en: 'Level test', es: 'Prueba de nivel', pt: 'Teste de nível' },
  // Search / collections
  'search.recent':        { en: 'Recent', es: 'Recientes', pt: 'Recentes' },
  'search.suggestions':   { en: 'Suggestions', es: 'Sugerencias', pt: 'Sugestões' },
  'search.unlockDef':     { en: 'Unlock to view definition', es: 'Desbloquea para ver la definición', pt: 'Desbloqueie para ver a definição' },
  'search.noMatches':     { en: 'No matches for “{q}”. Try a different spelling or a root word.', es: 'Sin resultados para «{q}». Prueba otra ortografía o una raíz.', pt: 'Nenhum resultado para “{q}”. Tente outra grafia ou uma raiz.' },
  'collections.title':    { en: 'Collections', es: 'Colecciones', pt: 'Coleções' },
  'collections.addNew':   { en: 'Add new', es: 'Añadir', pt: 'Adicionar' },
  'collections.create':   { en: 'Create', es: 'Crear', pt: 'Criar' },
  // Secondary screens
  'common.maybeLater':    { en: 'Maybe later', es: 'Quizás luego', pt: 'Talvez depois' },
  'common.notNow':        { en: 'Not now', es: 'Ahora no', pt: 'Agora não' },
  'voices.pronunciation': { en: 'Pronunciation', es: 'Pronunciación', pt: 'Pronúncia' },
  'voices.voice':         { en: 'Voice', es: 'Voz', pt: 'Voz' },
  'own.title':            { en: 'Your own words', es: 'Tus propias palabras', pt: 'Suas próprias palavras' },
  'own.addWord':          { en: 'Add word', es: 'Añadir palabra', pt: 'Adicionar palavra' },
  'own.personal':         { en: 'Personal', es: 'Personal', pt: 'Pessoal' },
  'widgets.steps':        { en: 'Add it in three steps', es: 'Añádelo en tres pasos', pt: 'Adicione em três passos' },
  'widgets.loading':      { en: 'Loading your words…', es: 'Cargando tus palabras…', pt: 'Carregando suas palavras…' },
  'widgets.hero':         { en: 'The hero feature', es: 'La función estrella', pt: 'O recurso principal' },
  'topics.following':     { en: 'Following', es: 'Siguiendo', pt: 'Seguindo' },
  'offer.claim':          { en: 'Claim offer now', es: 'Aprovecha la oferta', pt: 'Aproveitar oferta' },
  'offer.originalPrice':  { en: 'Original price', es: 'Precio original', pt: 'Preço original' },
  'offer.yourPriceNow':   { en: 'Your price now', es: 'Tu precio ahora', pt: 'Seu preço agora' },
  'offer.terms':          { en: 'Terms & Conditions', es: 'Términos y condiciones', pt: 'Termos e condições' },
  'auth.continueGoogle':  { en: 'Continue with Google', es: 'Continuar con Google', pt: 'Continuar com Google' },
  'auth.keepProgress':    { en: 'Keep your progress', es: 'Guarda tu progreso', pt: 'Salve seu progresso' },
  'welcome.swipeUp':      { en: 'Swipe up to begin', es: 'Desliza hacia arriba para empezar', pt: 'Deslize para cima para começar' },
  'feed.makeHabit':       { en: 'Make it a habit', es: 'Conviértelo en hábito', pt: 'Faça disso um hábito' },
  'feed.livePreview':     { en: 'See a live preview first', es: 'Ver una vista previa primero', pt: 'Ver uma prévia primeiro' },
  'feed.seeMembership':   { en: 'See membership', es: 'Ver membresía', pt: 'Ver assinatura' },
  'feed.freeTaste':       { en: "That's your free taste", es: 'Esa es tu muestra gratis', pt: 'Essa é sua amostra grátis' },
};

export function t(key: string, vars?: Record<string, string | number>): string {
  const row = STRINGS[key];
  let s = (row && (row[current] ?? row.en)) ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
  return s;
}
