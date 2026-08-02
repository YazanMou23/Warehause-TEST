"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Search,
  Send,
  Loader2,
  Lock,
  Unlock,
  AlertTriangle,
  User,
  Shield,
  Clock,
  ChevronRight,
  Inbox,
  UserCheck,
  CheckCheck,
} from "lucide-react";
import CustomAlertModal, { CustomAlertOptions } from "../../components/CustomAlertModal";

interface Conversation {
  id: string; // Partner's user ID
  name: string;
  username: string;
  role: string;
  isChatBlocked: boolean; // Tells manager if this employee is blocked
  lastMessage: {
    id: string;
    content: string;
    createdAt: string;
    senderId: string;
  } | null;
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
  read: boolean;
  sender: {
    id: string;
    name: string;
    role: string;
  };
  receiver: {
    id: string;
    name: string;
    role: string;
  };
}

export default function ChatPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [alertConfig, setAlertConfig] = useState<CustomAlertOptions>({
    isOpen: false,
    message: "",
  });

  const showAlert = (options: Omit<CustomAlertOptions, "isOpen">) => {
    setAlertConfig({ ...options, isOpen: true });
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  // Actor info from JWT
  const [actorId, setActorId] = useState("");
  const [actorRole, setActorRole] = useState("");
  const [actorName, setActorName] = useState("");
  const [isActorBlocked, setIsActorBlocked] = useState(false); // Only applies if employee

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Decoded JWT on mount
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.push("/login");
      return;
    }
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      setActorId(payload.sub || "");
      setActorRole(payload.role || "EMPLOYEE");
      setActorName(payload.name || "Benutzer");
    } catch (e) {
      console.error("Failed to decode token", e);
      router.push("/login");
    }
  }, [router]);

  // Fetch initial conversations list
  const fetchConversations = async (silent = false) => {
    if (!silent) setLoading(true);
    const token = localStorage.getItem("accessToken");
    try {
      if (isOffline) {
        // Load mock offline conversations from localStorage
        const storedConvs = localStorage.getItem(`mock_convs_${actorId}`);
        if (storedConvs) {
          setConversations(JSON.parse(storedConvs));
        } else {
          // Generate default mock conversations
          const defaultConvs = actorRole === "EMPLOYEE" ? [
            {
              id: "mgr-1",
              name: "Yazan Manager",
              username: "yazan_mgr",
              role: "MANAGER",
              isChatBlocked: false,
              lastMessage: {
                id: "msg-init-1",
                content: "Willkommen im LogiFlow-Chat. Wie kann ich helfen?",
                createdAt: new Date(Date.now() - 3600000).toISOString(),
                senderId: "mgr-1",
              },
              unreadCount: 0,
            },
            {
              id: "adm-1",
              name: "Admin Logiflow",
              username: "admin_hub",
              role: "ADMIN",
              isChatBlocked: false,
              lastMessage: null,
              unreadCount: 0,
            }
          ] : [
            {
              id: "emp-1",
              name: "Alex Arbeiter",
              username: "alex_arb",
              role: "EMPLOYEE",
              isChatBlocked: false,
              lastMessage: {
                id: "msg-init-2",
                content: "Hallo, ich habe eine Frage zu meiner Schicht morgen.",
                createdAt: new Date(Date.now() - 1800000).toISOString(),
                senderId: "emp-1",
              },
              unreadCount: 1,
            },
            {
              id: "emp-2",
              name: "Bella Buche",
              username: "bella_bu",
              role: "EMPLOYEE",
              isChatBlocked: true,
              lastMessage: {
                id: "msg-init-3",
                content: "Danke für die Schichtfreigabe.",
                createdAt: new Date(Date.now() - 7200000).toISOString(),
                senderId: "emp-2",
              },
              unreadCount: 0,
            }
          ];
          localStorage.setItem(`mock_convs_${actorId}`, JSON.stringify(defaultConvs));
          setConversations(defaultConvs);
        }
        
        // Check if employee actor is blocked
        if (actorRole === "EMPLOYEE") {
          const storedBlock = localStorage.getItem(`mock_blocked_${actorId}`);
          setIsActorBlocked(storedBlock === "true");
        }
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setConversations(data);
      
      // If we are an employee, we must find our own user details from endpoint or user settings to know if we are blocked
      if (actorRole === "EMPLOYEE") {
        const empRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/employees/${actorId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (empRes.ok) {
          const empData = await empRes.json();
          setIsActorBlocked(empData.isChatBlocked || false);
        }
      }
      setIsOffline(false);
    } catch (e) {
      console.warn("API offline, falling back to mock database.");
      setIsOffline(true);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Fetch message history for selected partner
  const fetchHistory = async (partnerId: string, silent = false) => {
    const token = localStorage.getItem("accessToken");
    try {
      if (isOffline) {
        // Load mock history from localStorage
        const storedMsgs = localStorage.getItem(`mock_msgs_${actorId}_${partnerId}`);
        if (storedMsgs) {
          setMessages(JSON.parse(storedMsgs));
        } else {
          // Default mock messages
          const defaultMsgs = [
            {
              id: "msg-init-1",
              senderId: partnerId,
              receiverId: actorId,
              content: partnerId === "mgr-1" || partnerId === "adm-1" 
                ? "Hallo! Wie kann ich Ihnen heute helfen?"
                : "Hallo, ich habe eine Frage zu meiner Schicht morgen.",
              createdAt: new Date(Date.now() - 3600000).toISOString(),
              read: true,
              sender: { id: partnerId, name: "Partner", role: "PARTNER" },
              receiver: { id: actorId, name: actorName, role: actorRole },
            }
          ];
          localStorage.setItem(`mock_msgs_${actorId}_${partnerId}`, JSON.stringify(defaultMsgs));
          setMessages(defaultMsgs);
        }
        
        // Reset unread count for this partner in localStorage
        const storedConvs = localStorage.getItem(`mock_convs_${actorId}`);
        if (storedConvs) {
          const convList = JSON.parse(storedConvs) as Conversation[];
          const updated = convList.map(c => c.id === partnerId ? { ...c, unreadCount: 0 } : c);
          localStorage.setItem(`mock_convs_${actorId}`, JSON.stringify(updated));
          setConversations(updated);
        }
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/chat/history/${partnerId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Fehler");
      const data = await res.json();
      setMessages(data);
      
      // Update unread count locally for smooth UI update
      setConversations(prev =>
        prev.map(c => c.id === partnerId ? { ...c, unreadCount: 0 } : c)
      );
    } catch (e) {
      console.error("Failed to load message history", e);
    }
  };

  // Poll conversations & active history
  useEffect(() => {
    if (!actorId) return;

    fetchConversations();

    const interval = setInterval(() => {
      fetchConversations(true);
      if (selectedPartnerId) {
        fetchHistory(selectedPartnerId, true);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [actorId, selectedPartnerId, isOffline]);

  // Fetch history when selecting partner
  useEffect(() => {
    if (selectedPartnerId) {
      fetchHistory(selectedPartnerId);
    }
  }, [selectedPartnerId]);

  // Auto scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle Send Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedPartnerId) return;
    setSending(true);
    setErrorMsg("");

    const token = localStorage.getItem("accessToken");
    const content = newMessage.trim();

    try {
      if (isOffline) {
        // Offline / Sandbox sending simulation
        // 1) Load current history
        const historyKey = `mock_msgs_${actorId}_${selectedPartnerId}`;
        const storedMsgs = JSON.parse(localStorage.getItem(historyKey) || "[]");
        
        // 2) Throttling logic check
        if (actorRole === "EMPLOYEE") {
          if (isActorBlocked) {
            throw new Error("Sie wurden von der Chat-Kommunikation ausgeschlossen.");
          }
          const lastMsg = storedMsgs[storedMsgs.length - 1];
          if (lastMsg && lastMsg.senderId === actorId) {
            throw new Error(
              "Sie können erst wieder eine Nachricht senden, wenn der Manager oder Admin auf Ihre vorherige Nachricht geantwortet hat."
            );
          }
        }

        const newMsgItem: ChatMessage = {
          id: `msg-${Date.now()}`,
          senderId: actorId,
          receiverId: selectedPartnerId,
          content: content,
          createdAt: new Date().toISOString(),
          read: false,
          sender: { id: actorId, name: actorName, role: actorRole },
          receiver: { id: selectedPartnerId, name: selectedPartner?.name || "Partner", role: selectedPartner?.role || "PARTNER" },
        };

        const updatedHistory = [...storedMsgs, newMsgItem];
        localStorage.setItem(historyKey, JSON.stringify(updatedHistory));
        setMessages(updatedHistory);
        setNewMessage("");

        // Update last message in conversation list
        const storedConvs = localStorage.getItem(`mock_convs_${actorId}`);
        if (storedConvs) {
          const convList = JSON.parse(storedConvs) as Conversation[];
          const updated = convList.map(c =>
            c.id === selectedPartnerId
              ? {
                  ...c,
                  lastMessage: {
                    id: newMsgItem.id,
                    content: newMsgItem.content,
                    createdAt: newMsgItem.createdAt,
                    senderId: actorId,
                  },
                }
              : c
          );
          localStorage.setItem(`mock_convs_${actorId}`, JSON.stringify(updated));
          setConversations(updated);
        }

        // Simulate auto manager response after 5 seconds to help test flow
        if (actorRole === "EMPLOYEE") {
          setTimeout(() => {
            const currentMsgs = JSON.parse(localStorage.getItem(historyKey) || "[]");
            const botMsg: ChatMessage = {
              id: `msg-bot-${Date.now()}`,
              senderId: selectedPartnerId,
              receiverId: actorId,
              content: `[Auto-Antwort] Ich habe deine Nachricht erhalten: "${content}". Wir melden uns in Kürze.`,
              createdAt: new Date().toISOString(),
              read: false,
              sender: { id: selectedPartnerId, name: selectedPartner?.name || "Manager", role: selectedPartner?.role || "MANAGER" },
              receiver: { id: actorId, name: actorName, role: actorRole },
            };
            const withBot = [...currentMsgs, botMsg];
            localStorage.setItem(historyKey, JSON.stringify(withBot));
            
            // Trigger refresh if still viewing the same chat
            if (selectedPartnerId) {
              setMessages(withBot);
              // Update last message in conversation list
              const latestConvs = JSON.parse(localStorage.getItem(`mock_convs_${actorId}`) || "[]") as Conversation[];
              const updatedConvs = latestConvs.map(c =>
                c.id === selectedPartnerId
                  ? {
                      ...c,
                      lastMessage: {
                        id: botMsg.id,
                        content: botMsg.content,
                        createdAt: botMsg.createdAt,
                        senderId: selectedPartnerId,
                      },
                      unreadCount: c.unreadCount + 1,
                    }
                  : c
              );
              localStorage.setItem(`mock_convs_${actorId}`, JSON.stringify(updatedConvs));
              setConversations(updatedConvs);
            }
          }, 4000);
        }
        return;
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/chat/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ receiverId: selectedPartnerId, content }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Senden fehlgeschlagen.");
      }

      setNewMessage("");
      fetchHistory(selectedPartnerId, true);
      fetchConversations(true);
    } catch (err: any) {
      setErrorMsg(err.message || "Fehler beim Senden.");
    } finally {
      setSending(false);
    }
  };

  const handleBlockToggle = (employeeId: string, currentBlockStatus: boolean) => {
    const actionLabel = currentBlockStatus ? "entsperren" : "blockieren";
    showAlert({
      title: currentBlockStatus ? "Mitarbeiter entsperren" : "Mitarbeiter blockieren",
      message: `Möchten Sie diesen Mitarbeiter wirklich ${actionLabel}?`,
      type: "warning",
      confirmText: currentBlockStatus ? "Entsperren" : "Blockieren",
      cancelText: "Abbrechen",
      onConfirm: async () => {
        const token = localStorage.getItem("accessToken");
        const nextBlockStatus = !currentBlockStatus;

        try {
          if (isOffline) {
            // Offline block simulation
            const storedConvs = localStorage.getItem(`mock_convs_${actorId}`);
            if (storedConvs) {
              const convList = JSON.parse(storedConvs) as Conversation[];
              const updated = convList.map(c => c.id === employeeId ? { ...c, isChatBlocked: nextBlockStatus } : c);
              localStorage.setItem(`mock_convs_${actorId}`, JSON.stringify(updated));
              setConversations(updated);
            }
            // Save global mock blocked state for employee's perspective
            localStorage.setItem(`mock_blocked_${employeeId}`, String(nextBlockStatus));
            showAlert({
              title: nextBlockStatus ? "Mitarbeiter blockiert" : "Mitarbeiter entsperrt",
              message: `Mitarbeiter wurde erfolgreich ${nextBlockStatus ? "blockiert" : "entsperrt"}.`,
              type: "success"
            });
            return;
          }

          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"}/users/${employeeId}/chat-block`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ isChatBlocked: nextBlockStatus }),
          });

          if (res.ok) {
            setConversations(prev => prev.map(c => c.id === employeeId ? { ...c, isChatBlocked: nextBlockStatus } : c));
            showAlert({
              title: nextBlockStatus ? "Mitarbeiter blockiert" : "Mitarbeiter entsperrt",
              message: `Mitarbeiter wurde erfolgreich ${nextBlockStatus ? "blockiert" : "entsperrt"}.`,
              type: "success"
            });
          } else {
            showAlert({ title: "Fehler", message: `Aktion "${actionLabel}" fehlgeschlagen.`, type: "error" });
          }
        } catch (err: any) {
          console.error(err);
          showAlert({ title: "Fehler", message: "Fehler beim Ausführen der Aktion.", type: "error" });
        }
      },
    });
  };

  // Search filter
  const filteredConversations = useMemo(() => {
    return conversations.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.username.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [conversations, searchQuery]);

  const selectedPartner = useMemo(() => {
    return conversations.find(c => c.id === selectedPartnerId) || null;
  }, [conversations, selectedPartnerId]);

  // Evaluate throttle status for employee sending
  const isSendDisabled = useMemo(() => {
    if (actorRole !== "EMPLOYEE") return false;
    if (isActorBlocked) return true;
    
    // Check if the last message in history was sent by this employee (self)
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      return lastMsg.senderId === actorId;
    }
    return false;
  }, [actorRole, isActorBlocked, messages, actorId]);

  const formatMessageTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div className="h-[calc(100vh-8rem)] sm:h-[80vh] flex bg-white border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
      
      {/* 1. LEFT SIDEBAR: Conversation list — hidden on mobile when a chat is open */}
      <div className={`${selectedPartnerId ? "hidden sm:flex" : "flex"} w-full sm:w-1/3 border-r border-outline-variant flex-col bg-slate-50/30 shrink-0`}>
        
        {/* Search */}
        <div className="p-4 border-b border-outline-variant bg-white">
          <h4 className="font-bold text-slate-800 text-body-lg flex items-center gap-2 mb-3">
            <MessageSquare className="w-5 h-5 text-secondary" />
            Chat-Kommunikation
          </h4>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Partner suchen..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-outline-variant rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 focus:outline-none focus:border-secondary"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-outline-variant">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-secondary" />
              <span className="text-xs">Lade Kontakte...</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-1.5 px-4 text-center">
              <Inbox className="w-7 h-7 opacity-50" />
              <p className="text-xs font-semibold">Keine Chatpartner gefunden</p>
              <p className="text-[10px] opacity-75">Vergewissern Sie sich, dass aktive Mitarbeiter/Manager registriert sind.</p>
            </div>
          ) : (
            filteredConversations.map(conv => {
              const isSelected = selectedPartnerId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => {
                  setSelectedPartnerId(conv.id);
                }}
                  className={`p-3.5 flex justify-between items-start cursor-pointer transition-colors ${
                    isSelected ? "bg-secondary-container/10 border-l-4 border-secondary" : "hover:bg-slate-50/50"
                  } ${conv.isChatBlocked ? "opacity-60" : ""}`}
                >
                  <div className="flex gap-3 min-w-0 flex-1">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-secondary font-bold text-xs shrink-0 flex items-center justify-center relative">
                      {getInitials(conv.name)}
                      {conv.unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 bg-error text-white font-extrabold text-[8px] rounded-full flex items-center justify-center">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-bold text-xs text-slate-900 truncate">{conv.name}</span>
                        <span className="text-[9px] uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold shrink-0">
                          {conv.role}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 truncate mt-0.5">
                        {conv.lastMessage ? conv.lastMessage.content : "Keine Nachrichten vorhanden"}
                      </p>
                    </div>
                  </div>

                  {/* Actions for Manager/Admin */}
                  {(actorRole === "MANAGER" || actorRole === "ADMIN") && (
                    <div onClick={e => e.stopPropagation()} className="pl-2 shrink-0">
                      <button
                        onClick={() => handleBlockToggle(conv.id, conv.isChatBlocked)}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          conv.isChatBlocked
                            ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                            : "bg-slate-50 text-slate-400 border-outline-variant hover:text-red-500 hover:border-red-200 hover:bg-red-50"
                        }`}
                        title={conv.isChatBlocked ? "Mitarbeiter freigeben" : "Mitarbeiter blockieren"}
                      >
                        {conv.isChatBlocked ? <Lock size={12} /> : <Unlock size={12} />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. RIGHT CHAT WINDOW — full width on mobile when open, flex-1 on desktop */}
      <div className={`${selectedPartnerId ? "flex" : "hidden sm:flex"} flex-1 flex-col bg-slate-50/10 min-w-0`}>
        {selectedPartner ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-outline-variant bg-white flex justify-between items-center shadow-sm">
              <div className="flex items-center gap-3">
                {/* Back button — only on mobile */}
                <button
                  className="sm:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors mr-1"
                  onClick={() => setSelectedPartnerId(null)}
                  aria-label="Back to conversations"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </button>
                <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-secondary font-bold text-xs flex items-center justify-center shrink-0">
                  {getInitials(selectedPartner.name)}
                </div>
                <div className="min-w-0">
                  <h5 className="font-bold text-xs text-slate-900 leading-none truncate">{selectedPartner.name}</h5>
                  <span className="text-[9px] text-slate-500 mt-1 block truncate">@{selectedPartner.username} • {selectedPartner.role}</span>
                </div>
              </div>

              {selectedPartner.isChatBlocked && (
                <span className="text-[10px] bg-red-50 text-red-800 border border-red-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="w-3 h-3 text-red-600" /> Blockiert
                </span>
              )}
            </div>

            {/* Message Feed Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#f8fafc]/50">
              {messages.map(msg => {
                const isSelf = msg.senderId === actorId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isSelf ? "justify-end" : "justify-start"} animate-fadeIn`}
                  >
                    <div className="flex flex-col gap-0.5 max-w-[70%]">
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-xs shadow-sm ${
                          isSelf
                            ? "bg-secondary text-white rounded-tr-none font-medium"
                            : "bg-white text-slate-800 border border-outline-variant rounded-tl-none"
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>
                      <span className={`text-[9px] text-slate-400 font-mono self-end px-1 mt-0.5`}>
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Footer input form */}
            <div className="p-4 border-t border-outline-variant bg-white">
              {errorMsg && (
                <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {actorRole === "EMPLOYEE" && isActorBlocked ? (
                <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl flex items-center gap-2.5 text-xs font-bold uppercase tracking-wide">
                  <Lock className="w-4 h-4 text-red-600 shrink-0" />
                  Absenden gesperrt. Sie wurden von einem Manager blockiert.
                </div>
              ) : actorRole === "EMPLOYEE" && isSendDisabled ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl flex items-center gap-2.5 text-xs font-bold tracking-wide">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                  Warten auf Antwort... (Sie können erst nach einer Antwort des Managers wieder schreiben).
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nachricht eingeben..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    className="flex-1 bg-slate-50 border border-outline-variant rounded-xl px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:border-secondary focus:bg-white transition-all outline-none"
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={sending || !newMessage.trim()}
                    className="bg-secondary hover:bg-blue-700 disabled:opacity-40 text-white p-2.5 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
            <MessageSquare className="w-12 h-12 opacity-30 text-secondary" />
            <h5 className="font-bold text-sm text-slate-700">Willkommen beim LogiFlow-Chat</h5>
            <p className="text-xs text-slate-500 max-w-xs text-center">
              Wählen Sie einen Mitarbeiter oder Manager aus der linken Spalte aus, um eine Unterhaltung zu beginnen.
            </p>
          </div>
        )}
      </div>

      {/* Custom Popup Alert Modal */}
      <CustomAlertModal
        {...alertConfig}
        onClose={() => setAlertConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
