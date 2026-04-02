import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Smile, Reply, Pin, Trash2 } from 'lucide-react';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🔥', '👏'];

const ChatPanel = ({ isOpen, onClose, socket, userName, avatarUrl, unreadCount, onResetUnread }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showEmojiFor, setShowEmojiFor] = useState(null); // msg id for reaction picker
  const [replyTo, setReplyTo] = useState(null); // message being replied to
  const [pinnedIds, setPinnedIds] = useState(new Set());
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const msgIdRef = useRef(0);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200);
      onResetUnread?.();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for incoming messages & reactions
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (data) => {
      setMessages(prev => [...prev, {
        id: data.id,
        sender: data.senderName,
        senderId: data.userId,
        avatarUrl: data.avatarUrl,
        text: data.text,
        timestamp: new Date(data.timestamp),
        reactions: {},
        replyTo: data.replyTo || null,
        isLocal: false,
      }]);
    };

    const handleReaction = (data) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === data.messageId) {
          const reactions = { ...msg.reactions };
          const emoji = data.emoji;
          if (!reactions[emoji]) reactions[emoji] = [];
          // Toggle: remove if already reacted by this user
          if (reactions[emoji].includes(data.senderName)) {
            reactions[emoji] = reactions[emoji].filter(n => n !== data.senderName);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          } else {
            reactions[emoji] = [...reactions[emoji], data.senderName];
          }
          return { ...msg, reactions };
        }
        return msg;
      }));
    };

    const handleDeleteMsg = (data) => {
      setMessages(prev => prev.map(msg => 
        msg.id === data.messageId 
          ? { ...msg, text: '🗑️ Message deleted', deleted: true }
          : msg
      ));
    };

    const handlePinMsg = (data) => {
      setPinnedIds(prev => {
        const next = new Set(prev);
        if (data.pinned) next.add(data.messageId);
        else next.delete(data.messageId);
        return next;
      });
    };

    socket.on('chat-message', handleMessage);
    socket.on('chat-reaction', handleReaction);
    socket.on('chat-delete', handleDeleteMsg);
    socket.on('chat-pin', handlePinMsg);

    return () => {
      socket.off('chat-message', handleMessage);
      socket.off('chat-reaction', handleReaction);
      socket.off('chat-delete', handleDeleteMsg);
      socket.off('chat-pin', handlePinMsg);
    };
  }, [socket]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;

    const id = `${socket.id}-${msgIdRef.current++}`;
    const msg = {
      id,
      sender: userName,
      senderId: socket.id,
      avatarUrl: avatarUrl,
      text: input.trim(),
      timestamp: new Date(),
      reactions: {},
      replyTo: replyTo ? { id: replyTo.id, sender: replyTo.sender, text: replyTo.text } : null,
      isLocal: true,
    };

    setMessages(prev => [...prev, msg]);
    socket.emit('chat-message', {
      id,
      senderName: userName,
      avatarUrl: avatarUrl,
      text: input.trim(),
      timestamp: msg.timestamp.toISOString(),
      replyTo: msg.replyTo,
    });

    setInput('');
    setReplyTo(null);
  };

  const toggleReaction = (messageId, emoji) => {
    // Optimistically update local
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId) {
        const reactions = { ...msg.reactions };
        if (!reactions[emoji]) reactions[emoji] = [];
        if (reactions[emoji].includes(userName)) {
          reactions[emoji] = reactions[emoji].filter(n => n !== userName);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...reactions[emoji], userName];
        }
        return { ...msg, reactions };
      }
      return msg;
    }));
    setShowEmojiFor(null);

    socket?.emit('chat-reaction', { messageId, emoji, senderName: userName });
  };

  const deleteMessage = (messageId) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, text: '🗑️ Message deleted', deleted: true }
        : msg
    ));
    socket?.emit('chat-delete', { messageId });
  };

  const togglePin = (messageId) => {
    const isPinned = pinnedIds.has(messageId);
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (isPinned) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
    socket?.emit('chat-pin', { messageId, pinned: !isPinned });
  };

  const formatTime = (date) => {
    if (!(date instanceof Date)) date = new Date(date);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const pinnedMessages = messages.filter(m => pinnedIds.has(m.id) && !m.deleted);

  if (!isOpen) return null;

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <h3>In-call messages</h3>
        <button className="chat-close-btn" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {/* Pinned Messages */}
      {pinnedMessages.length > 0 && (
        <div className="pinned-section">
          <div className="pinned-label"><Pin size={12} /> Pinned</div>
          {pinnedMessages.map(msg => (
            <div key={msg.id} className="pinned-msg" onClick={() => {
              document.getElementById(`msg-${msg.id}`)?.scrollIntoView({ behavior: 'smooth' });
            }}>
              <span className="pinned-sender">{msg.sender}:</span>
              <span className="pinned-text">{msg.text.length > 40 ? msg.text.slice(0, 40) + '…' : msg.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <span>💬</span>
            <p>No messages yet</p>
            <p className="chat-empty-sub">Messages are only visible to people in the call</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMe = msg.isLocal;
          const showAvatar = idx === 0 || messages[idx - 1].senderId !== msg.senderId;
          const reactionEntries = Object.entries(msg.reactions || {});

          return (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              className={`chat-msg ${isMe ? 'chat-msg-mine' : 'chat-msg-peer'} ${pinnedIds.has(msg.id) ? 'chat-msg-pinned' : ''}`}
            >
              {showAvatar && (
                <div className="chat-msg-header">
                  {msg.avatarUrl ? (
                    <img src={msg.avatarUrl} alt={msg.sender} className="chat-msg-avatar" />
                  ) : (
                    <span className="chat-msg-avatar chat-msg-avatar-fallback">{msg.sender.charAt(0).toUpperCase()}</span>
                  )}
                  <span className="chat-msg-sender">{isMe ? 'You' : msg.sender}</span>
                  <span className="chat-msg-time">{formatTime(msg.timestamp)}</span>
                </div>
              )}

              {/* Reply context */}
              {msg.replyTo && (
                <div className="chat-reply-context" onClick={() => {
                  document.getElementById(`msg-${msg.replyTo.id}`)?.scrollIntoView({ behavior: 'smooth' });
                }}>
                  <div className="reply-bar" />
                  <div>
                    <span className="reply-sender">{msg.replyTo.sender}</span>
                    <span className="reply-text">{msg.replyTo.text.length > 50 ? msg.replyTo.text.slice(0, 50) + '…' : msg.replyTo.text}</span>
                  </div>
                </div>
              )}

              <div className={`chat-bubble ${msg.deleted ? 'chat-deleted' : ''}`}>
                <span>{msg.text}</span>

                {/* Hover actions */}
                {!msg.deleted && (
                  <div className="chat-msg-actions">
                    <button onClick={() => setShowEmojiFor(showEmojiFor === msg.id ? null : msg.id)} title="React">
                      <Smile size={14} />
                    </button>
                    <button onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }} title="Reply">
                      <Reply size={14} />
                    </button>
                    <button onClick={() => togglePin(msg.id)} title={pinnedIds.has(msg.id) ? 'Unpin' : 'Pin'}>
                      <Pin size={14} className={pinnedIds.has(msg.id) ? 'pin-active' : ''} />
                    </button>
                    {isMe && (
                      <button onClick={() => deleteMessage(msg.id)} title="Delete">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Reaction picker */}
              {showEmojiFor === msg.id && (
                <div className="chat-reaction-picker">
                  {REACTION_EMOJIS.map(emoji => (
                    <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)} className="reaction-pick-btn">
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Reactions display */}
              {reactionEntries.length > 0 && (
                <div className="chat-reactions-row">
                  {reactionEntries.map(([emoji, users]) => (
                    <button
                      key={emoji}
                      className={`reaction-chip ${users.includes(userName) ? 'reaction-mine' : ''}`}
                      onClick={() => toggleReaction(msg.id, emoji)}
                      title={users.join(', ')}
                    >
                      <span>{emoji}</span>
                      <span className="reaction-count">{users.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="chat-reply-bar">
          <div className="reply-bar" />
          <div className="chat-reply-info">
            <span>Replying to <strong>{replyTo.sender === userName ? 'yourself' : replyTo.sender}</strong></span>
            <span className="reply-preview">{replyTo.text.length > 40 ? replyTo.text.slice(0, 40) + '…' : replyTo.text}</span>
          </div>
          <button className="reply-cancel" onClick={() => setReplyTo(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input */}
      <form className="chat-input-bar" onSubmit={sendMessage}>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder="Send a message to everyone"
          value={input}
          onChange={e => setInput(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className="chat-send-btn" disabled={!input.trim()}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

export default ChatPanel;
