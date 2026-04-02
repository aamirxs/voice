import React, { useRef, useState, useEffect } from 'react';
import { Megaphone, Drum, PartyPopper, Bug, Frown, UploadCloud, X } from 'lucide-react';

const Soundbar = ({ onPlaySound }) => {
  const fileInputRef = useRef(null);
  const [customSoundName, setCustomSoundName] = useState(localStorage.getItem('customSoundName'));

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File too large. Please select a smaller sound file (under 2MB).');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const audioTest = new Audio(objectUrl);
    
    audioTest.addEventListener('loadedmetadata', () => {
      if (audioTest.duration > 15) {
        alert('Custom sound cannot exceed 15 seconds.');
        URL.revokeObjectURL(objectUrl);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64Audio = event.target.result;
          try {
            localStorage.setItem('customSoundCache', base64Audio);
            localStorage.setItem('customSoundName', file.name);
            setCustomSoundName(file.name);
          } catch(e) {
             console.warn('LocalStorage limit exceeded, custom sound is session only.');
             setCustomSoundName(file.name);
          }
          onPlaySound({
             type: 'custom',
             base64: base64Audio,
             name: file.name
          });
          URL.revokeObjectURL(objectUrl);
        };
        reader.readAsDataURL(file);
      }
      e.target.value = ''; 
    });
  };

  const playCustomFromCache = () => {
    const cached = localStorage.getItem('customSoundCache');
    if (cached) {
      onPlaySound({ type: 'custom', base64: cached, name: customSoundName || 'Custom' });
    } else {
      fileInputRef.current.click();
    }
  };

  const clearCustom = (e) => {
    e.stopPropagation();
    localStorage.removeItem('customSoundCache');
    localStorage.removeItem('customSoundName');
    setCustomSoundName(null);
    if(fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="soundbar-popover">
      <button className="sound-btn" onClick={() => onPlaySound('airhorn')}>
        <div className="sound-icon-wrapper airhorn-icon">
          <Megaphone size={24} />
        </div>
        <span>Airhorn</span>
      </button>
      
      <button className="sound-btn" onClick={() => onPlaySound('ba_dum_tss')}>
        <div className="sound-icon-wrapper drum-icon">
          <Drum size={24} />
        </div>
        <span>Pun Drum</span>
      </button>

      <button className="sound-btn" onClick={() => onPlaySound('clap')}>
        <div className="sound-icon-wrapper applause-icon">
          <PartyPopper size={24} />
        </div>
        <span>Clap</span>
      </button>

      <button className="sound-btn" onClick={() => onPlaySound('cricket')}>
        <div className="sound-icon-wrapper cricket-icon">
          <Bug size={24} />
        </div>
        <span>Cricket</span>
      </button>

      <button className="sound-btn" onClick={() => onPlaySound('sad_horn')}>
        <div className="sound-icon-wrapper sad-horn-icon">
          <Frown size={24} />
        </div>
        <span>Sad Horn</span>
      </button>

      <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)', margin: '4px 6px' }}></div>

      <div style={{ position: 'relative' }}>
        {customSoundName && (
          <button 
            onClick={clearCustom}
            style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#e74c3c', borderRadius: '50%', padding: '2px', color: 'white', border: 'none', cursor: 'pointer', zIndex: 10, display: 'flex' }}
            title="Remove Custom Sound"
          >
            <X size={12} />
          </button>
        )}
        <button className="sound-btn" onClick={playCustomFromCache} title={customSoundName ? `Play ${customSoundName}` : "Choose Custom Sound"}>
          <div className="sound-icon-wrapper custom-upload-icon">
            <UploadCloud size={20} />
          </div>
          <span>{customSoundName ? "Custom" : "Custom"}</span>
        </button>
      </div>

      <input 
        type="file" 
        accept="audio/*" 
        style={{ display: 'none' }} 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
      />
    </div>
  );
};

export default Soundbar;
