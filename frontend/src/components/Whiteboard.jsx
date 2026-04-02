import React, { useRef, useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';

const Whiteboard = ({ socket, isHost, onClose }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [brushSize, setBrushSize] = useState(3);
  
  // To compute deltas more accurately
  const lastPos = useRef({ x: 0, y: 0 });

  // Handle incoming socket events
  useEffect(() => {
    if (!socket) return;

    const handleDrawLine = (lineData) => {
      drawLineOnCanvas(lineData.x0, lineData.y0, lineData.x1, lineData.y1, lineData.color, lineData.size);
    };

    const handleClearBoard = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    const handleWhiteboardState = (history) => {
      history.forEach(line => {
        drawLineOnCanvas(line.x0, line.y0, line.x1, line.y1, line.color, line.size);
      });
    };

    socket.on('draw-line', handleDrawLine);
    socket.on('clear-board', handleClearBoard);
    socket.on('whiteboard-state', handleWhiteboardState);

    return () => {
      socket.off('draw-line', handleDrawLine);
      socket.off('clear-board', handleClearBoard);
      socket.off('whiteboard-state', handleWhiteboardState);
    };
  }, [socket]);

  // Set up canvas sizing
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (canvas && canvas.parentElement) {
        const parent = canvas.parentElement;
        const rect = parent.getBoundingClientRect();
        
        // We preserve drawing if resized, by creating a temporary canvas
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        if (canvas.width > 0 && canvas.height > 0) {
          tempCtx.drawImage(canvas, 0, 0);
        }

        canvas.width = rect.width;
        canvas.height = rect.height;
        
        // Restore
        const ctx = canvas.getContext('2d');
        ctx.drawImage(tempCanvas, 0, 0);
      }
    };

    // Initial size
    resizeCanvas();
    
    // Throttle resize
    let timeout;
    const handleResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(resizeCanvas, 100);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) / rect.width, // Store relative positions (0.0 to 1.0)
      y: (clientY - rect.top) / rect.height
    };
  };

  const drawLineOnCanvas = (x0, y0, x1, y1, colorStr, size) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.beginPath();
    ctx.moveTo(x0 * canvas.width, y0 * canvas.height);
    ctx.lineTo(x1 * canvas.width, y1 * canvas.height);
    ctx.strokeStyle = colorStr;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.closePath();
  };

  const startDrawing = (e) => {
    setIsDrawing(true);
    lastPos.current = getPos(e);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault(); // Prevent scrolling on touch

    const currentPos = getPos(e);
    
    // Draw locally instantly
    drawLineOnCanvas(lastPos.current.x, lastPos.current.y, currentPos.x, currentPos.y, color, brushSize);

    // Emit
    if (socket) {
      socket.emit('draw-line', {
        x0: lastPos.current.x,
        y0: lastPos.current.y,
        x1: currentPos.x,
        y1: currentPos.y,
        color,
        size: brushSize
      });
    }

    lastPos.current = currentPos;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClear = () => {
    if (!isHost) return;
    socket.emit('clear-board');
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: 'rgba(20, 20, 25, 0.9)', display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Bar for Whiteboard */}
      <div style={{ 
        height: '50px', 
        background: 'rgba(0,0,0,0.5)', 
        display: 'flex', 
        alignItems: 'center', 
        padding: '0 16px',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ color: '#fff', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', fontSize: '13px' }}>
            Graffiti Board
          </div>
          
          <input 
            type="color" 
            value={color} 
            onChange={(e) => setColor(e.target.value)}
            style={{ width: '32px', height: '32px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
            title="Choose Color"
          />
          
          <input 
            type="range" 
            min="1" 
            max="20" 
            value={brushSize} 
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            style={{ width: '100px' }}
            title="Brush Size"
          />
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {isHost && (
            <button 
              onClick={handleClear}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
            >
              <Trash2 size={16} />
              Clear Board
            </button>
          )}
          
          <button 
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div style={{ flex: 1, position: 'relative', cursor: 'crosshair', overflow: 'hidden' }}>
        <canvas 
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{ display: 'block', touchAction: 'none' }} /* touchAction none is critical for mobile drawing */
        />
      </div>
    </div>
  );
};

export default Whiteboard;
