import React, { useState, useEffect } from "react";
import { openDB } from "idb";
import { initGoogleGIS, requestAccessToken, trySilentLogin, uploadToDrive, loadFromDrive } from "./googleDrive";

function App() {
  const [expenses, setExpenses] = useState([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [mode, setMode] = useState("year");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [userName, setUserName] = useState(null);

  const months = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
  ];

  useEffect(() => {
    const init = async () => {
      const db = await openDB("financeDB", 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains("expenses")) {
            db.createObjectStore("expenses", { keyPath: "id", autoIncrement: true });
          }
        },
      });
      const all = await db.getAll("expenses");
      setExpenses(all);

      try {
        await initGoogleGIS();

        // Tenta token guardado
        const savedToken = localStorage.getItem("drive_token");
        if (savedToken) {
          setUserName("Utilizador");
          const driveData = await loadFromDrive();
          if (driveData.length > 0) {
            const tx = db.transaction("expenses", "readwrite");
            tx.store.clear();
            await tx.done;
            for (const e of driveData) await db.add("expenses", e);
            setExpenses(await db.getAll("expenses"));
          }
        } else {
          // tenta login silencioso
          await trySilentLogin();
          setUserName("Utilizador");
          const driveData = await loadFromDrive();
          if (driveData.length > 0) {
            const tx = db.transaction("expenses", "readwrite");
            tx.store.clear();
            await tx.done;
            for (const e of driveData) await db.add("expenses", e);
            setExpenses(await db.getAll("expenses"));
          }
        }
      } catch (err) {
        console.log("Usuário não logado automaticamente:", err);
      }
    };
    init();
  }, []);

  const addExpenseToDB = async (expense) => {
    const db = await openDB("financeDB", 1);
    const id = await db.add("expenses", expense);
    return { ...expense, id };
  };

  const deleteExpenseFromDB = async (id) => {
    const db = await openDB("financeDB", 1);
    await db.delete("expenses", id);
  };

  const trySyncToDrive = async (currentExpenses) => {
    if (!userName) return;
    try {
      const ok = await uploadToDrive(currentExpenses);
      if (!ok) console.warn("Upload para Drive não foi bem-sucedido");
    } catch (err) {
      console.error("Erro ao sincronizar com Drive:", err);
    }
  };

  const addExpense = async () => {
    if (!description || !amount) return;
    const expenseDate = date ? new Date(date) : new Date();
    if (expenseDate.setHours(0,0,0,0) > new Date().setHours(0,0,0,0)) {
      alert("❌ Não podes adicionar uma despesa com data no futuro!");
      return;
    }

    const expense = { description, amount: parseFloat(amount), date: expenseDate.toISOString() };
    const saved = await addExpenseToDB(expense);
    const updated = [...expenses, saved];
    setExpenses(updated);
    setDescription(""); setAmount(""); setDate("");

    await trySyncToDrive(updated);
  };

  const deleteExpense = async (id) => {
    const expense = expenses.find(e => e.id === id);
    if (!expense) return;
    const confirmDelete = window.confirm(`Tens a certeza que queres eliminar "${expense.description}" (€${expense.amount.toFixed(2)})?`);
    if (!confirmDelete) return;

    await deleteExpenseFromDB(id);
    const updated = expenses.filter(e => e.id !== id);
    setExpenses(updated);
    await trySyncToDrive(updated);
  };

  const handleGoogleLogin = async () => {
    try {
      await requestAccessToken();
      setUserName("Utilizador");
      const db = await openDB("financeDB", 1);
      const driveData = await loadFromDrive();
      if (driveData.length > 0) {
        const tx = db.transaction("expenses", "readwrite");
        tx.store.clear();
        await tx.done;
        for (const e of driveData) await db.add("expenses", e);
        setExpenses(await db.getAll("expenses"));
      }
    } catch (err) {
      console.error("Erro no login Google:", err);
      alert("Não foi possível iniciar sessão com Google. Confirma Client ID e script GIS.");
    }
  };

  const groupByMonth = (year) => {
    const grouped = {};
    expenses.forEach(e => {
      const d = new Date(e.date);
      if (d.getFullYear() === year) grouped[d.getMonth()] = (grouped[d.getMonth()] || 0) + e.amount;
    });
    return grouped;
  };

  const getExpensesForMonth = (year, month) => {
    return expenses
      .filter(e => { const d = new Date(e.date); return d.getFullYear() === year && d.getMonth() === month; })
      .sort((a,b) => new Date(a.date) - new Date(b.date));
  };

  const yearData = groupByMonth(selectedYear);
  const monthExpenses = getExpensesForMonth(selectedYear, selectedMonth);

  const styles = {
    container: { padding: 20, fontFamily: "'Inter', sans-serif", maxWidth: 760, margin: "auto", backgroundColor: "#f6f7fb", minHeight: "100vh" },
    card: { backgroundColor: "#fff", borderRadius: 14, boxShadow: "0 6px 18px rgba(15,23,42,0.06)", padding: 18, marginBottom: 18 },
    button: { backgroundColor: "#0b74ff", color: "#fff", border: "none", padding: "8px 14px", borderRadius: 10, cursor: "pointer" },
    smallButton: { backgroundColor: "#0b74ff", color: "#fff", border: "none", padding: "6px 10px", borderRadius: 8, cursor: "pointer", marginLeft: 8 },
    deleteBtn: { backgroundColor: "#ff4d4d", color: "white", border: "none", padding: "6px 10px", borderRadius: 8, cursor: "pointer", marginLeft: 10 },
    input: { marginRight: 10, borderRadius: 10, border: "1px solid #e6e9ef", padding: "8px 12px", width: 200 },
    select: { marginLeft: 10, borderRadius: 10, border: "1px solid #e6e9ef", padding: "8px 12px" },
    topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }
  };

  return (
    <div style={styles.container}>
      <div style={styles.topBar}>
        <h1 style={{ color: "#222", margin: 0 }}>💸 Controle de Gastos</h1>
        <div>
          {!userName ? (
            <button style={styles.button} onClick={handleGoogleLogin}>Iniciar sessão com Google</button>
          ) : (
            <span style={{ color: "#333" }}>Olá, {userName} ✓</span>
          )}
        </div>
      </div>

      {/* Adicionar despesa */}
      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Adicionar Despesa</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input placeholder="Descrição" value={description} onChange={e => setDescription(e.target.value)} style={styles.input} />
          <input type="number" placeholder="Valor (€)" value={amount} onChange={e => setAmount(e.target.value)} style={{...styles.input, width:120}} />
          <input type="date" max={new Date().toISOString().split("T")[0]} value={date} onChange={e => setDate(e.target.value)} style={styles.input} />
          <button style={styles.smallButton} onClick={addExpense}>Adicionar</button>
        </div>
      </div>

      {/* Filtros */}
      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Filtros</h3>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <label>Modo:</label>
          <select value={mode} onChange={e => setMode(e.target.value)} style={styles.select}>
            <option value="year">Ano</option>
            <option value="month">Mês</option>
          </select>

          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={styles.select}>
            {[...new Set([...expenses.map(e => new Date(e.date).getFullYear()), new Date().getFullYear()])].sort((a,b)=>b-a).map(y => <option key={y} value={y}>{y}</option>)}
          </select>

          {mode === "month" && (
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} style={styles.select}>
              {months.map((m,i) => <option key={i} value={i}>{m}</option>)}
            </select>
          )}

        </div>
      </div>

      {/* Ano */}
      {mode === "year" && (
        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>Gastos em {selectedYear}</h2>
          <ul style={{ paddingLeft: 18 }}>
            {months.map((m, i) => (
              <li key={i} style={{ padding: "6px 0" }}>
                <strong>{m}:</strong> €{(yearData[i] || 0).toFixed(2)}
              </li>
            ))}
          </ul>
          <h3 style={{ marginTop: 12 }}>Total do Ano: €{Object.values(yearData).reduce((a,b)=>a+b,0).toFixed(2)}</h3>
        </div>
      )}

      {/* Mês */}
      {mode === "month" && (
        <div style={styles.card}>
          <h2 style={{ marginTop: 0 }}>Gastos em {months[selectedMonth]} de {selectedYear}</h2>

          {monthExpenses.length === 0 ? (
            <p>Sem despesas registadas neste mês.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {monthExpenses.map(e => (
                <li key={e.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:"1px solid #f0f0f2" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{e.description}</div>
                    <div style={{ color:"#666", fontSize:13 }}>{new Date(e.date).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ fontWeight:600 }}>€{e.amount.toFixed(2)}</div>
                    <button style={styles.deleteBtn} onClick={() => deleteExpense(e.id)}>Eliminar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h3 style={{ marginTop: 12 }}>Total do Mês: €{monthExpenses.reduce((a,b)=>a+b.amount,0).toFixed(2)}</h3>
        </div>
      )}
    </div>
  );
}

export default App;
