import { useState, useRef, useEffect } from 'react';
import { Settings, ArrowLeft, Bluetooth } from 'lucide-react';

export default function Home() {
  // États de base
  const [view, setView] = useState('game');
  const [currentList, setCurrentList] = useState('zodiac');
  const [possibleWords, setPossibleWords] = useState(['belier', 'taureau', 'gemeaux', 'cancer', 'lion', 'vierge', 'balance', 'scorpion', 'sagittaire', 'capricorne', 'verseau', 'poissons']);
  const [questionHistory, setQuestionHistory] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [touchStart, setTouchStart] = useState(null);
  const [lastSwipe, setLastSwipe] = useState(null);
  const [inputMethod, setInputMethod] = useState('swipe');
  const [bluetoothStatus, setBluetoothStatus] = useState('disconnected');
  const [debugLog, setDebugLog] = useState([]);
  const characteristicRef = useRef(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(true);
  const [isStandalone, setIsStandalone] = useState(false);
  const [lastTouched, setLastTouched] = useState(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
      setIsStandalone(true);
      setShowInstallPrompt(false);
    }
  }, []);

  const addLog = (message) => {
    setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`].slice(-5));
  };

  const connectPeeksmith = async () => {
  try {
    // Détection de la plateforme
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isMacOS = /Mac/.test(navigator.userAgent) && !isIOS;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    addLog(`Plateforme: ${isIOS ? 'iOS' : isMacOS ? 'MacOS' : 'Autre'}`);
    addLog(`Mode: ${isStandalone ? 'Standalone' : 'Browser'}`);

    // Pour iOS, vérifier si c'est Chrome ou une PWA
    if (isIOS && !isStandalone) {
      alert('Sur iOS, vous devez:\n1. Ouvrir cette page dans Safari\n2. Appuyer sur le bouton partage\n3. Choisir "Sur l\'écran d\'accueil"\n4. Ouvrir l\'application depuis l\'icône');
      return;
    }

    // Pour MacOS, suggérer Chrome
    if (isMacOS && !navigator.bluetooth) {
      alert('Sur MacOS, veuillez utiliser Google Chrome pour le support Bluetooth');
      return;
    }

    // Vérification du support Bluetooth
    if (!navigator.bluetooth) {
      addLog('API Bluetooth non disponible');
      if (isIOS && isStandalone) {
        alert('Erreur : Bluetooth non disponible\nVérifiez que:\n1. Le Bluetooth est activé\n2. L\'app est ouverte depuis l\'écran d\'accueil\n3. L\'autorisation Bluetooth est accordée');
      } else {
        alert('Le Bluetooth n\'est pas supporté par votre navigateur');
      }
      return;
    }

    addLog('Tentative de connexion Bluetooth...');
    setBluetoothStatus('connecting');

    // Demander l'autorisation Bluetooth
    const available = await navigator.bluetooth.getAvailability();
    if (!available) {
      alert('Bluetooth non disponible. Vérifiez qu\'il est activé dans les paramètres.');
      return;
    }

    // Recherche du PeekSmith
    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'PeekSmith' },
        { services: ['0000ffe0-0000-1000-8000-00805f9b34fb'] }
      ]
    });

    addLog('PeekSmith trouvé, connexion...');
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
    const characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
    
    characteristicRef.current = characteristic;
    addLog('Connecté au PeekSmith');

    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handlePeeksmithButton);
    
    setBluetoothStatus('connected');
    setInputMethod('bluetooth');
    
    await sendToPeeksmith('$Ready\n');

  } catch (error) {
    console.error('Erreur Bluetooth:', error);
    addLog(`Erreur: ${error.message}`);
    setBluetoothStatus('disconnected');

    // Message d'erreur spécifique
    if (error.name === 'NotFoundError') {
      alert('PeekSmith non trouvé. Vérifiez qu\'il est allumé et à proximité.');
    } else if (error.name === 'SecurityError') {
      alert('Accès Bluetooth refusé. Veuillez autoriser l\'accès dans les paramètres.');
    } else {
      alert(`Erreur de connexion : ${error.message}`);
    }
  }
};

  const handlePeeksmithButton = (event) => {
    const value = new Uint8Array(event.target.value.buffer);
    const message = new TextDecoder().decode(value);
    addLog(`Reçu: ${message}`);

    if (message.includes('button_left')) {
      addLog('Bouton gauche pressé - NON');
      handleResponse(false);
    } else if (message.includes('button_right')) {
      addLog('Bouton droit pressé - OUI');
      handleResponse(true);
    } else if (message.includes('button_side')) {
      addLog('Bouton latéral pressé - RESET');
      restart();
    }
  };

  const findBestQuestion = (words) => {
    if (!words || words.length <= 1) return null;
    const letterFrequency = {};
    words.forEach(word => {
      [...new Set(word)].forEach(letter => {
        letterFrequency[letter] = (letterFrequency[letter] || 0) + 1;
      });
    });
    
    let bestLetter = '';
    let bestScore = Infinity;
    Object.entries(letterFrequency).forEach(([letter, frequency]) => {
      const score = Math.abs(words.length / 2 - frequency);
      if (score < bestScore) {
        bestScore = score;
        bestLetter = letter;
      }
    });
    return bestLetter;
  };
  const handleResponse = async (isYes) => {
    const letter = currentQuestion || findBestQuestion(possibleWords);
    const newHistory = [...questionHistory, {
      letter,
      response: isYes
    }];
    setQuestionHistory(newHistory);
    
    const newPossibleWords = possibleWords.filter(word => 
      isYes === word.includes(letter)
    );
    setPossibleWords(newPossibleWords);

    if (bluetoothStatus === 'connected') {
      await sendToPeeksmith(`$${letter}\n`);
    }

    if (newPossibleWords.length <= 1) {
      if (bluetoothStatus === 'connected' && newPossibleWords[0]) {
        await sendToPeeksmith(`$${newPossibleWords[0].toUpperCase()}\n`);
      }
      setView('result');
    } else {
      const nextQuestion = findBestQuestion(newPossibleWords);
      setCurrentQuestion(nextQuestion);
    }
    
    setLastSwipe(isYes ? 'up' : 'down');
    setTimeout(() => setLastSwipe(null), 200);
  };

  const handleTouchStart = (e) => {
    if (inputMethod !== 'swipe') return;
    setTouchStart(e.touches[0].clientY);
  };

  const handleTouchEnd = (e) => {
    if (inputMethod !== 'swipe' || !touchStart || view !== 'game') return;
    const touchEnd = e.changedTouches[0].clientY;
    const swipeDistance = touchEnd - touchStart;
    if (Math.abs(swipeDistance) > 50) {
      handleResponse(swipeDistance < 0);
    }
    setTouchStart(null);
  };

  const restart = async () => {
    setPossibleWords(['belier', 'taureau', 'gemeaux', 'cancer', 'lion', 'vierge', 'balance', 'scorpion', 'sagittaire', 'capricorne', 'verseau', 'poissons']);
    setQuestionHistory([]);
    const firstQuestion = findBestQuestion(['belier', 'taureau', 'gemeaux', 'cancer', 'lion', 'vierge', 'balance', 'scorpion', 'sagittaire', 'capricorne', 'verseau', 'poissons']);
    setCurrentQuestion(firstQuestion);
    setView('game');

    if (bluetoothStatus === 'connected') {
      await sendToPeeksmith(`$${firstQuestion}\n`);
    }
  };

  return (
    <div className="h-screen w-screen bg-black text-neutral-400 font-mono text-xs">
      <button 
        className="absolute top-4 right-4 z-10 p-2 opacity-50 hover:opacity-100"
        onClick={() => setView(view === 'settings' ? 'game' : 'settings')}
      >
        {view === 'settings' ? <ArrowLeft className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
      </button>

      {bluetoothStatus !== 'disconnected' && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-4 text-[10px] space-y-1">
          {debugLog.map((log, i) => (
            <div key={i} className="opacity-50">{log}</div>
          ))}
        </div>
      )}

      {view === 'settings' && (
        <div className="h-full w-full p-4 pt-16 space-y-6">
          <h2 className="text-lg mb-6">Paramètres</h2>
          
          <div className="space-y-4">
            <h3 className="text-sm opacity-50">Méthode d'input</h3>

            {!isStandalone && showInstallPrompt && (
              <div className="p-3 border border-yellow-500 rounded mb-4">
                <p className="text-sm">
                  Pour utiliser le PeekSmith, ajoutez d'abord cette app à votre écran d'accueil :
                </p>
                <ol className="text-xs mt-2 space-y-1 opacity-75">
                  <li>1. Appuyez sur le bouton Partager ⬆️</li>
                  <li>2. Faites défiler et appuyez sur "Sur l'écran d'accueil" 📱</li>
                  <li>3. Appuyez sur "Ajouter" ➕</li>
                </ol>
                <button 
                  onClick={() => setShowInstallPrompt(false)} 
                  className="text-xs opacity-50 mt-2"
                >
                  Fermer
                </button>
              </div>
            )}
            
            <button 
              className={`w-full p-3 border rounded flex items-center justify-between ${
                inputMethod === 'swipe' ? 'border-blue-500' : 'border-neutral-800'
              }`}
              onClick={() => setInputMethod('swipe')}
            >
              <span>Swipe</span>
              <span className="text-[10px] opacity-50">Haut/Bas</span>
            </button>

            <button 
              className={`w-full p-3 border rounded flex items-center justify-between ${
                inputMethod === 'bluetooth' ? 'border-blue-500' : 'border-neutral-800'
              }`}
              onClick={connectPeeksmith}
            >
              <span>PeekSmith</span>
              <div className="flex items-center gap-2">
                <Bluetooth className={`h-3 w-3 ${bluetoothStatus === 'connected' ? 'text-green-500' : ''}`} />
                <span className="text-[10px] opacity-50">
                  {bluetoothStatus === 'connected' ? 'Connecté' : 
                   bluetoothStatus === 'connecting' ? 'Connexion...' : 
                   'Cliquer pour connecter'}
                </span>
              </div>
            </button>

            {bluetoothStatus === 'connected' && (
              <button 
                onClick={() => sendToPeeksmith('$Test\n')}
                className="w-full p-3 border rounded bg-blue-500/10 hover:bg-blue-500/20"
              >
                Tester la connexion
              </button>
            )}
          </div>
        </div>
      )}

      {view === 'game' && (
        <div 
          className="h-full w-full relative"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="absolute top-4 left-4 opacity-30">
            {possibleWords.length}
          </div>

          <div className="h-full flex flex-col justify-end pb-20 px-4">
            <div className="space-y-4">
              <div className="text-center text-[8px] opacity-20">
                {inputMethod === 'swipe' ? '↑ oui | non ↓' :
                 inputMethod === 'bluetooth' ? 'PeekSmith' :
                 '← non | oui →'}
              </div>
              <div className="text-center">
                <span className="text-3xl opacity-40">
                  {currentQuestion || findBestQuestion(possibleWords)}
                </span>
              </div>
              <div className="flex flex-wrap justify-center gap-x-2 text-[8px] opacity-20">
                {questionHistory.map((q, i) => (
                  <span key={i}>
                    {q.letter}{q.response ? '↑' : '↓'}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className={`absolute inset-0 pointer-events-none transition-colors
            ${lastSwipe === 'up' ? 'bg-green-900/20' : ''}
            ${lastSwipe === 'down' ? 'bg-red-900/20' : ''}`}
          />
        </div>
      )}

      {view === 'result' && (
        <div 
          className="h-full w-full flex flex-col items-center justify-center"
          onClick={restart}
        >
          <div className="text-2xl opacity-40 mb-4">
            {possibleWords[0]}
          </div>
          <div className="text-xs opacity-30">
            Tap pour recommencer
          </div>
        </div>
      )}
    </div>
  );
}
