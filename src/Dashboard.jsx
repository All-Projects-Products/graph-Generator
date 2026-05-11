import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, BarChart2, Activity, PieChart as PieChartIcon, Target, Cpu, Trash2, Download, Plus, LayoutGrid, ScatterChart as ScatterIcon, Layers, X, Database, Zap, HelpCircle, FileText, AlertCircle, ChevronRight, ChevronUp, ChevronDown, Menu, Mail } from 'lucide-react';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
  PieChart as RechartsPieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ScatterChart, Scatter, ZAxis
} from 'recharts';

const MODEL_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E'];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [globalMetric, setGlobalMetric] = useState('Precision/Recall');
  const [hoveredTool, setHoveredTool] = useState(null);
  const [hoverY, setHoverY] = useState(0);
  const [canvasBlocks, setCanvasBlocks] = useState([]);
  const [showGuide, setShowGuide] = useState(false);
  const [toast, setToast] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);

  // Model Selection State
  const [pendingGraph, setPendingGraph] = useState(null);

  const dashboardRef = useRef(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const processData = (parsedData) => {
    if (!Array.isArray(parsedData) || parsedData.length === 0) {
      setToast({ message: "Upload failed: File is empty or invalid." });
      return;
    }

    const firstRow = parsedData[0];
    if (firstRow.model === undefined) {
      setToast({ message: "Missing 'model' column. Please check your data format." });
      return;
    }
    if (firstRow.rank === undefined) {
      setToast({ message: "Missing 'rank' column. Please check your data format." });
      return;
    }

    let totalQueries = 0;
    let hits = 0;
    let instantWins = 0;
    let found = 0;
    let misses = 0;
    let totalLatency = 0;
    let totalCost = 0;

    const modelStats = {};
    const timelineData = [];
    const scatterData = [];
    const categoryStats = {};
    const uniqueModels = new Set();

    parsedData.forEach((row, i) => {
      if (row.model === undefined || row.rank === undefined) return;

      totalQueries++;

      const rankVal = Number(row.rank);
      const isInstantWin = rankVal === 1;
      const isFound = rankVal > 1;
      const isMiss = rankVal === 0 || rankVal === -1;

      if (isInstantWin) instantWins++;
      if (isFound) found++;
      if (isMiss) misses++;

      const isHit = isInstantWin || isFound;
      if (isHit) hits++;

      const latency = Number(row.latency_ms) || 50;
      totalLatency += latency;

      const qLen = Number(row.query_length) || (row.query ? String(row.query).length : 20);
      const cost = Number(row.cost) || (latency * 0.000002);
      totalCost += cost;

      const m = String(row.model);
      const category = row.category ? String(row.category) : 'General';
      uniqueModels.add(m);

      if (!modelStats[m]) modelStats[m] = { hits: 0, instantWins: 0, found: 0, misses: 0, queries: 0, latency: 0, qLenSum: 0, costSum: 0 };
      modelStats[m].queries++;
      if (isHit) modelStats[m].hits++;
      if (isInstantWin) modelStats[m].instantWins++;
      if (isFound) modelStats[m].found++;
      if (isMiss) modelStats[m].misses++;
      modelStats[m].latency += latency;
      modelStats[m].qLenSum += qLen;
      modelStats[m].costSum += cost;

      timelineData.push({ qLen, latency, throughput: Math.floor(1000 / latency), model: m });
      scatterData.push({ queryLength: qLen, latency, model: m, isHit: isHit ? 1 : 0 });

      if (!categoryStats[m]) categoryStats[m] = {};
      if (!categoryStats[m][category]) categoryStats[m][category] = { total: 0, failed: 0 };
      categoryStats[m][category].total++;
      if (isMiss) categoryStats[m][category].failed++;
    });

    if (totalQueries === 0) {
      setToast({ message: "No valid rows found in the file." });
      return;
    }

    timelineData.sort((a, b) => a.qLen - b.qLen);

    const modelColorMap = {};
    Array.from(uniqueModels).forEach((m, idx) => {
      modelColorMap[m] = MODEL_COLORS[idx % MODEL_COLORS.length];
    });

    const initialBlocks = [
      { id: 'default_bar', type: 'groupedBar' },
      { id: 'default_line', type: 'dualLine', targetModel: Array.from(uniqueModels)[0] }
    ];

    setCanvasBlocks(initialBlocks);
    setMetrics({
      hitRate: (hits / totalQueries) * 100,
      avgLatency: totalLatency / totalQueries,
      avgCost1k: (totalCost / totalQueries) * 1000,
      totalQueries,
      hits,
      instantWins,
      found,
      misses,
      modelStats,
      timelineData,
      scatterData,
      categoryStats,
      uniqueModels: Array.from(uniqueModels),
      modelColorMap
    });
    setData(parsedData);
  };

  const handleFile = (file) => {
    if (!file) return;
    if (file.name.endsWith('.csv')) {
      Papa.parse(file, { header: true, dynamicTyping: true, skipEmptyLines: true, complete: (res) => processData(res.data) });
    } else if (file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          let content = e.target.result.trim();
          if (content.includes('][')) content = content.replace(/\]\[/g, ',');
          const json = JSON.parse(content);
          processData(Array.isArray(json) ? json : [json]);
        } catch (error) {
          setToast({ message: "Invalid JSON file format." });
        }
      };
      reader.readAsText(file);
    } else {
      setToast({ message: "Unsupported file type. Please upload JSON or CSV." });
    }
  };

  const handleLoadDemo = () => {
    const demoData = Array.from({ length: 150 }).map((_, i) => {
      const m = Math.random() > 0.6 ? 'Gemini 3' : (Math.random() > 0.3 ? 'Voyage 3.5' : 'OpenAI 3-Large');
      const cat = ['Finance', 'Healthcare', 'E-commerce'][Math.floor(Math.random() * 3)];
      const latency = Math.floor(Math.random() * 150) + 40 + (m === 'Gemini 3' ? 30 : 0);
      return {
        query: `Test query number ${i}`,
        latency_ms: latency,
        rank: Math.random() > 0.7 ? 0 : (Math.random() > 0.4 ? 1 : Math.floor(Math.random() * 4) + 2),
        model: m,
        category: cat
      };
    });
    processData(demoData);
  };

  const toolLabels = {
    groupedBar: { name: 'Accuracy Comparison', icon: BarChart2, tags: ['Precision/Recall'], isModelSpecific: false, desc: 'Model hit rate comparison.', info: 'Accuracy Bar Chart: Compares Rank 1 success rates across all selected models.' },
    radar: { name: 'Radar Comparison', icon: Target, tags: ['Precision/Recall', 'Cost Efficiency'], isModelSpecific: false, desc: 'Compare Accuracy, Speed, Cost.', info: 'Radar Chart: Provides a multi-dimensional comparison of overall model capabilities.' },
    bubble: { name: '3D Complexity Bubble', icon: Database, tags: ['Cost Efficiency', 'Throughput/Latency'], isModelSpecific: false, desc: 'Accuracy vs Time vs Complexity.', info: 'Bubble Chart: Visualizes the trade-off between Accuracy, Latency, and Query Complexity across models.' },

    dualLine: { name: 'Time Performance', icon: Activity, tags: ['Throughput/Latency'], isModelSpecific: true, desc: 'Latency mapped over query length.', info: 'Time Performance: Tracks how latency scales dynamically as your queries get longer.' },
    donut: { name: 'Success Distribution', icon: PieChartIcon, tags: ['Precision/Recall'], isModelSpecific: true, desc: 'Instant Wins vs Found vs Misses.', info: 'Donut Chart: A clear breakdown of instant rank 1 hits versus lower rank retrievals and total misses.' },
    heatmap: { name: 'Category Failure Grid', icon: LayoutGrid, tags: ['Precision/Recall'], isModelSpecific: true, desc: 'Failing categories per model.', info: 'Failure Grid: A view showing exactly which data categories are failing for a specific model.' },
    scatter: { name: 'Latency Scatter', icon: ScatterIcon, tags: ['Throughput/Latency'], isModelSpecific: true, desc: 'Identify query length bottlenecks.', info: 'Scatter Plot: Identifies if your database gets slower as your questions get longer.' }
  };

  const triggerAddGraph = (type) => {
    if (toolLabels[type].isModelSpecific) {
      setPendingGraph(type);
    } else {
      setCanvasBlocks([{ id: Math.random().toString(36).substring(2, 10), type }, ...canvasBlocks]);
      setMobileMenuOpen(false);
      setHoveredTool(null);
    }
  };

  const confirmModelSpecificGraph = (model) => {
    setCanvasBlocks([{ id: Math.random().toString(36).substring(2, 10), type: pendingGraph, targetModel: model }, ...canvasBlocks]);
    setPendingGraph(null);
    setMobileMenuOpen(false);
    setHoveredTool(null);
  };

  const removeGraph = (id) => setCanvasBlocks(canvasBlocks.filter(b => b.id !== id));

  const moveGraph = (index, direction) => {
    if (index + direction < 0 || index + direction >= canvasBlocks.length) return;
    const newBlocks = [...canvasBlocks];
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[index + direction];
    newBlocks[index + direction] = temp;
    setCanvasBlocks(newBlocks);
  };

  const exportDashboard = async () => {
    if (!dashboardRef.current) return;

    const element = dashboardRef.current;

    // Fix for Recharts + html2canvas: Force iframe to match current window size
    // so ResponsiveContainer doesn't shrink and cut off charts.
    const canvas = await html2canvas(element, {
      backgroundColor: '#F8FAFC',
      scale: 2,
      windowWidth: document.documentElement.offsetWidth,
      windowHeight: document.documentElement.offsetHeight
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

    // Multi-page PDF generation for tall dashboards
    let heightLeft = pdfHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
    }

    pdf.save('benchmark-suite-export.pdf');
  };

  // Recharts styling constants for Light Mode
  const chartProps = {
    gridStroke: "#E2E8F0",
    axisStroke: "#64748B",
    tooltipStyle: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', color: '#1E293B', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }
  };

  const renderGraph = (block) => {
    if (!metrics) return null;

    if (block.type === 'groupedBar') {
      const d = Object.entries(metrics.modelStats).map(([key, val]) => ({
        name: key,
        Accuracy: Number(((val.instantWins / val.queries) * 100).toFixed(1)),
        fill: metrics.modelColorMap[key]
      }));
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={d} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartProps.gridStroke} vertical={false} />
            <XAxis dataKey="name" stroke={chartProps.axisStroke} axisLine={false} tickLine={false} />
            <YAxis stroke={chartProps.axisStroke} axisLine={false} tickLine={false} domain={[0, 100]} />
            <Tooltip cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }} contentStyle={chartProps.tooltipStyle} />
            <Bar dataKey="Accuracy" radius={[6, 6, 0, 0]} maxBarSize={60}>
              {d.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (block.type === 'radar') {
      const radarData = Object.entries(metrics.modelStats).map(([key, val]) => ({
        subject: key,
        Accuracy: (val.hits / val.queries) * 100,
        Speed: Math.max(0, 100 - (val.latency / val.queries) / 2),
        CostEfficiency: Math.max(0, 100 - (val.costSum / val.queries) * 10000)
      }));
      return (
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="65%" data={radarData}>
            <PolarGrid stroke={chartProps.gridStroke} />
            <PolarAngleAxis dataKey="subject" tick={{ fill: chartProps.axisStroke, fontSize: 11 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar name="Accuracy" dataKey="Accuracy" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.2} />
            <Radar name="Speed" dataKey="Speed" stroke="#10B981" fill="#10B981" fillOpacity={0.2} />
            <Radar name="Cost" dataKey="CostEfficiency" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.2} />
            <Tooltip contentStyle={chartProps.tooltipStyle} />
          </RadarChart>
        </ResponsiveContainer>
      );
    }

    if (block.type === 'bubble') {
      const bubbleData = Object.entries(metrics.modelStats).map(([key, val]) => ({
        name: key,
        accuracy: Number(((val.hits / val.queries) * 100).toFixed(1)),
        latency: Number((val.latency / val.queries).toFixed(0)),
        complexity: Number((val.qLenSum / val.queries).toFixed(0)),
        fill: metrics.modelColorMap[key]
      }));
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartProps.gridStroke} vertical={false} />
            <XAxis type="number" dataKey="accuracy" name="Accuracy %" stroke={chartProps.axisStroke} domain={[0, 100]} />
            <YAxis type="number" dataKey="latency" name="Latency (ms)" stroke={chartProps.axisStroke} />
            <ZAxis type="number" dataKey="complexity" range={[100, 500]} name="Complexity" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={chartProps.tooltipStyle} />
            <Scatter name="Models" data={bubbleData}>
              {bubbleData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} opacity={0.8} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    const model = block.targetModel;
    const modelColor = metrics.modelColorMap[model] || '#3B82F6';

    if (block.type === 'dualLine') {
      const lineData = metrics.timelineData.filter(d => d.model === model);
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={lineData} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartProps.gridStroke} vertical={false} />
            <XAxis dataKey="qLen" name="Query Length" stroke={chartProps.axisStroke} axisLine={false} tickLine={false} minTickGap={20} />
            <YAxis yAxisId="left" stroke={chartProps.axisStroke} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={chartProps.tooltipStyle} />
            <Line yAxisId="left" type="monotone" dataKey="latency" name="Latency (ms)" stroke={modelColor} strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (block.type === 'donut') {
      const stats = metrics.modelStats[model];
      const pieData = [
        { name: 'Instant Wins', value: stats.instantWins },
        { name: 'Found', value: stats.found },
        { name: 'Misses', value: stats.misses }
      ];
      return (
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={90} paddingAngle={4} dataKey="value" stroke="none">
              <Cell fill={modelColor} />
              <Cell fill={`${modelColor}60`} />
              <Cell fill="#EF4444" />
            </Pie>
            <Tooltip contentStyle={chartProps.tooltipStyle} />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ color: chartProps.axisStroke, fontSize: '13px', fontWeight: 500 }} />
          </RechartsPieChart>
        </ResponsiveContainer>
      );
    }

    if (block.type === 'heatmap') {
      const categoryData = metrics.categoryStats[model];
      const barData = categoryData ? Object.entries(categoryData).map(([cat, stats]) => ({
        category: cat,
        failureRate: Number(((stats.failed / stats.total) * 100).toFixed(1))
      })) : [];

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} layout="vertical" margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartProps.gridStroke} horizontal={true} vertical={false} />
            <XAxis type="number" stroke={chartProps.axisStroke} axisLine={false} tickLine={false} domain={[0, 100]} />
            <YAxis type="category" dataKey="category" stroke={chartProps.axisStroke} axisLine={false} tickLine={false} width={100} />
            <Tooltip cursor={{ fill: 'rgba(239, 68, 68, 0.05)' }} contentStyle={chartProps.tooltipStyle} />
            <Bar dataKey="failureRate" name="Failure %" fill="#EF4444" radius={[0, 6, 6, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (block.type === 'scatter') {
      const scatData = metrics.scatterData.filter(d => d.model === model);
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartProps.gridStroke} vertical={false} />
            <XAxis type="number" dataKey="queryLength" name="Query Length" stroke={chartProps.axisStroke} />
            <YAxis type="number" dataKey="latency" name="Latency (ms)" stroke={chartProps.axisStroke} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={chartProps.tooltipStyle} />
            <Scatter name="Queries" data={scatData} fill={modelColor} opacity={0.7} />
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-surface/80 backdrop-blur-md">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest">Analytics Toolbox</h3>
        {mobileMenuOpen && (
          <button onClick={() => setMobileMenuOpen(false)} className="md:hidden text-text-muted p-1">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 p-4 overflow-y-auto scrollbar-hide">
        <div className="flex flex-col gap-3">
          {Object.entries(toolLabels).map(([key, info]) => {
            const isRelevant = info.tags.includes(globalMetric);
            return (
              <div
                key={key}
                className="relative group"
                onMouseEnter={(e) => {
                  setHoveredTool(key);
                  setHoverY(e.currentTarget.getBoundingClientRect().top);
                }}
                onMouseLeave={() => setHoveredTool(null)}
              >
                <button
                  onClick={() => triggerAddGraph(key)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${isRelevant ? 'bg-primary/5 border-primary/20 shadow-sm' : 'bg-surface border-border hover:border-primary/30 hover:shadow-md'}`}
                >
                  <div className={`p-2 rounded-lg transition-colors ${isRelevant ? 'bg-primary text-white' : 'bg-background border border-border text-text-muted group-hover:text-primary group-hover:border-primary/20'}`}>
                    <info.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate text-text group-hover:text-primary transition-colors">{info.name}</div>
                  </div>
                  <Plus className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>

                {/* Hide Popover on Mobile to prevent UI breaking */}
                <AnimatePresence>
                  {hoveredTool === key && !mobileMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, x: -10, scale: 0.95 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      style={{ top: hoverY, left: 296 }}
                      className="fixed w-72 bg-white border border-border rounded-2xl p-5 shadow-[0_20px_50px_rgba(0,0,0,0.2)] z-50 pointer-events-none"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                          <info.icon className="w-5 h-5" />
                        </div>
                        <span className="font-bold text-base text-text">{info.name}</span>
                      </div>
                      <p className="text-[13px] text-text-muted leading-relaxed mb-4">{info.info}</p>
                      {info.isModelSpecific ?
                        <span className="inline-block px-2.5 py-1 bg-primary/10 rounded-md text-[10px] uppercase tracking-wider text-primary font-bold">Deep Dive View</span> :
                        <span className="inline-block px-2.5 py-1 bg-success/10 rounded-md text-[10px] uppercase tracking-wider text-success font-bold">Comparison View</span>
                      }
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 border-t border-border bg-surface">
        <button onClick={() => { setData(null); setCanvasBlocks([]); setMetrics(null); setMobileMenuOpen(false); }} className="w-full text-center text-sm font-semibold text-text-muted hover:text-danger hover:bg-danger/5 rounded-lg transition-all py-3">
          Clear Workspace
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-background text-text flex flex-col font-sans">
      <Toast toast={toast} setToast={setToast} />

      {/* Modern Fixed Navbar */}
      <header className="flex-none z-50 w-full bg-surface border-b border-border shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {metrics && (
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden p-2 text-text-muted hover:text-primary">
                <Menu className="w-6 h-6" />
              </button>
            )}
            <div className="p-2 bg-gradient-to-tr from-primary to-accent rounded-xl text-white shadow-lg shadow-primary/20 shrink-0">
              <Layers className="w-5 h-5 sm:w-5 sm:h-5" />
            </div>
            <span className="text-lg sm:text-xl font-bold tracking-tight text-text whitespace-nowrap">Data Vis Studio</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 relative">
            <button 
              onClick={() => setExploreOpen(!exploreOpen)}
              className="relative overflow-hidden group bg-surface border border-border hover:border-primary text-text px-4 sm:px-6 py-2 rounded-full font-semibold transition-all shadow-sm text-sm sm:text-base whitespace-nowrap flex items-center gap-2"
            >
              <span className="relative z-10 hidden sm:inline">Explore Me</span>
              <span className="relative z-10 sm:hidden">Explore</span>
              <ChevronDown className={`w-4 h-4 relative z-10 transition-transform ${exploreOpen ? 'rotate-180' : ''}`} />
              <div className="absolute inset-0 h-full w-full bg-primary/10 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
              <span className="absolute -inset-1 rounded-full border border-primary opacity-0 group-hover:opacity-100 animate-pulse"></span>
            </button>
            
            <AnimatePresence>
              {exploreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExploreOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full right-0 mt-2 w-56 bg-surface border border-border rounded-2xl shadow-xl z-50 overflow-hidden"
                  >
                    <div className="p-2 space-y-1">
                      <a href="https://www.linkedin.com/in/muzamil-mern-stack-developer/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 text-sm font-semibold text-text-muted hover:text-primary hover:bg-primary/5 rounded-xl transition-colors">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                        </svg>
                        See on LinkedIn
                      </a>
                      <a href="https://github.com/hussain-labs" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 text-sm font-semibold text-text-muted hover:text-text hover:bg-background rounded-xl transition-colors">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                        </svg>
                        See on GitHub
                      </a>
                      <a href="mailto:muzamilhusain.dev@gmail.com" className="flex items-center gap-3 p-3 text-sm font-semibold text-text-muted hover:text-text hover:bg-background rounded-xl transition-colors">
                        <Mail className="w-4 h-4" />
                        Contact me
                      </a>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      {/* Model Selection Modal */}
      <AnimatePresence>
        {pendingGraph && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-text/20 backdrop-blur-sm"
              onClick={() => setPendingGraph(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-surface border border-border rounded-[24px] shadow-2xl p-6 w-full max-w-sm overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary to-accent" />
              <div className="flex justify-between items-center mb-6 pt-2">
                <h3 className="text-xl font-bold text-text">Select Model</h3>
                <button onClick={() => setPendingGraph(null)} className="text-text-muted hover:text-text bg-background p-1.5 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-text-muted mb-6">Choose a model to isolate performance metrics for the Deep Dive view.</p>
              <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-1">
                {metrics?.uniqueModels.map(m => (
                  <button
                    key={m}
                    onClick={() => confirmModelSpecificGraph(m)}
                    className="flex items-center justify-between p-4 rounded-xl bg-background border border-border hover:border-primary hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full shadow-inner" style={{ backgroundColor: metrics.modelColorMap[m] }} />
                      <span className="font-bold text-text">{m}</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-primary transition-colors transform group-hover:translate-x-1" />
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Guide Drawer */}
      <AnimatePresence>
        {showGuide && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-text/20 backdrop-blur-sm" onClick={() => setShowGuide(false)} />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="relative w-full max-w-md bg-surface h-full shadow-2xl border-l border-border p-8 flex flex-col"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-bold flex items-center gap-3"><FileText className="w-7 h-7 text-primary" /> Data Preparation</h3>
                <button onClick={() => setShowGuide(false)} className="text-text-muted hover:text-text bg-background p-2 rounded-full"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-6 text-base text-text-muted flex-1 overflow-y-auto scrollbar-hide">
                <p>Create a simple CSV or JSON array containing these required fields to power the studio:</p>
                <div className="space-y-4">
                  <div className="bg-background p-4 rounded-xl border border-border shadow-sm"><strong className="text-text block mb-1">query</strong> The text of the question or payload.</div>
                  <div className="bg-background p-4 rounded-xl border border-border shadow-sm"><strong className="text-text block mb-1">model</strong> The AI model evaluated (e.g., "Gemini 3").</div>
                  <div className="bg-background p-4 rounded-xl border border-border shadow-sm"><strong className="text-text block mb-1">latency_ms</strong> Time taken in milliseconds.</div>
                  <div className="bg-background p-4 rounded-xl border border-border shadow-sm"><strong className="text-text block mb-1">rank</strong> Retrieval position (1 for instant win, 0 for miss).</div>
                  <div className="bg-background p-4 rounded-xl border border-border shadow-sm"><strong className="text-text block mb-1">category</strong> Optional tag like "Support".</div>
                </div>

                <div className="mt-8">
                  <p className="font-bold text-text mb-3">Example JSON Format:</p>
                  <pre className="bg-text text-surface p-4 rounded-xl text-xs sm:text-sm overflow-x-auto shadow-inner font-mono leading-relaxed">
{`[
  {
    "query": "How to reset my password?",
    "model": "Gemini 3",
    "latency_ms": 142,
    "rank": 1,
    "category": "Support"
  },
  {
    "query": "Show my latest billing cycle",
    "model": "Voyage 3.5",
    "latency_ms": 89,
    "rank": 0,
    "category": "Finance"
  }
]`}
                  </pre>
                </div>
              </div>
              <button onClick={() => setShowGuide(false)} className="mt-8 w-full bg-primary hover:bg-primary-dark text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-primary/30 transition-all">Understood, Let's Go</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upload View */}
      {(!data || !metrics) && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="min-h-full flex flex-col items-center justify-center max-w-3xl mx-auto py-8">
            <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full">
              <div className="text-center mb-10 sm:mb-12">
                <h1 className="text-4xl sm:text-5xl font-black mb-4 sm:mb-6 tracking-tight text-text">Benchmark with Clarity</h1>
                <p className="text-text-muted text-lg sm:text-xl max-w-2xl mx-auto px-2">Upload your retrieval logs and instantly generate premium, board-ready performance analytics.</p>
              </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFile(e.dataTransfer.files[0]); }}
              className={`border-2 border-dashed rounded-[32px] p-8 sm:p-16 text-center transition-all duration-300 transform ${isDragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border bg-surface hover:border-primary/50 hover:shadow-2xl hover:-translate-y-1'}`}
            >
              <div className="w-20 h-20 sm:w-24 sm:h-24 bg-background rounded-full flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-sm">
                <UploadCloud className={`w-10 h-10 sm:w-12 sm:h-12 ${isDragging ? 'text-primary' : 'text-primary/60'}`} />
              </div>
              <h3 className="text-xl sm:text-2xl font-bold mb-3 text-text">Drag & Drop Model Logs</h3>
              <p className="text-text-muted mb-8 text-base sm:text-lg">JSON or CSV • Strict privacy (local parsing)</p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full">
                <label className="w-full sm:w-auto cursor-pointer bg-primary hover:bg-primary-dark text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg shadow-primary/30 text-lg">
                  Browse Files
                  <input type="file" className="hidden" accept=".json,.csv" onChange={(e) => handleFile(e.target.files[0])} />
                </label>
                <button onClick={handleLoadDemo} className="w-full sm:w-auto bg-surface hover:bg-background border-2 border-border px-8 py-4 rounded-xl font-bold text-text transition-all text-lg">
                  Load Demo Data
                </button>
              </div>

              <button onClick={() => setShowGuide(true)} className="mt-8 sm:mt-10 text-primary hover:text-primary-dark font-semibold flex items-center justify-center gap-2 mx-auto transition-colors">
                <HelpCircle className="w-5 h-5" /> View Data Requirements
              </button>
            </div>
          </motion.div>
          
          <div className="mt-12 text-center w-full text-text-muted text-sm font-medium">
            Developed by Muzamil Hussain
          </div>
        </div>
      </div>
      )}

      {/* Studio View */}
      {data && metrics && (
        <div className="flex-1 flex overflow-hidden relative">

          {/* Mobile Sidebar Overlay */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="md:hidden absolute inset-0 bg-text/20 backdrop-blur-sm z-40"
                onClick={() => setMobileMenuOpen(false)}
              />
            )}
          </AnimatePresence>

          {/* Sidebar */}
          <aside className={`absolute md:relative left-0 top-0 z-50 md:z-10 w-72 h-full flex-none transform transition-transform duration-300 border-r border-border shadow-2xl md:shadow-none bg-surface ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
            <SidebarContent />
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-background relative z-0">
            <div className="max-w-[1600px] mx-auto w-full pb-32">

              <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h1 className="text-3xl font-black mb-2 text-text tracking-tight">Performance Overview</h1>
                  <p className="text-text-muted text-base font-medium">Select a global context below to filter key metrics.</p>
                </div>

                <div className="bg-surface p-1.5 rounded-xl border border-border inline-flex shadow-sm">
                  {['Precision/Recall', 'Throughput/Latency'].map(m => (
                    <button
                      key={m}
                      onClick={() => setGlobalMetric(m)}
                      className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${globalMetric === m ? 'bg-background shadow-sm border border-border text-primary' : 'text-text-muted hover:text-text'
                        }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
                {globalMetric === 'Precision/Recall' && [
                  { l: 'Global Hit Rate', v: `${metrics.hitRate.toFixed(1)}%`, i: Target, c: 'text-primary', bg: 'bg-primary/10' },
                  { l: 'Instant Wins', v: metrics.instantWins.toLocaleString(), i: Zap, c: 'text-success', bg: 'bg-success/10' },
                  { l: 'Total Queries', v: metrics.totalQueries.toLocaleString(), i: Database, c: 'text-text-muted', bg: 'bg-background' },
                  { l: 'Total Misses', v: metrics.misses.toLocaleString(), i: AlertCircle, c: 'text-danger', bg: 'bg-danger/10' }
                ].map((s, i) => <MetricCard key={i} {...s} />)}

                {globalMetric === 'Throughput/Latency' && [
                  { l: 'Avg Latency', v: `${metrics.avgLatency.toFixed(0)} ms`, i: Activity, c: 'text-warning', bg: 'bg-warning/10' },
                  { l: 'Avg QPS', v: `${Math.floor(1000 / metrics.avgLatency)} req/s`, i: Zap, c: 'text-primary', bg: 'bg-primary/10' },
                  { l: 'P99 Latency (Est)', v: `${(metrics.avgLatency * 1.8).toFixed(0)} ms`, i: Target, c: 'text-danger', bg: 'bg-danger/10' },
                  { l: 'Total Queries', v: metrics.totalQueries.toLocaleString(), i: Database, c: 'text-text-muted', bg: 'bg-background' }
                ].map((s, i) => <MetricCard key={i} {...s} />)}
              </div>

              <div ref={dashboardRef} className="px-1 -mx-1">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  <AnimatePresence>
                    {canvasBlocks.map((block, index) => {
                      const info = toolLabels[block.type];
                      const isWide = ['dualLine', 'groupedBar', 'histogram'].includes(block.type);
                      return (
                        <motion.div
                          key={block.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                          className={`bg-surface rounded-2xl p-6 border border-border shadow-sm hover:shadow-xl transition-all duration-300 group ${isWide ? 'md:col-span-2' : ''}`}
                        >
                          <div className="flex justify-between items-start mb-8">
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 bg-primary/10 rounded-md"><info.icon className="w-5 h-5 text-primary" /></div>
                                <h3 className="text-lg font-bold text-text tracking-tight">
                                  {info.name} {block.targetModel && <span className="text-primary font-semibold ml-1 bg-primary/10 px-2 py-0.5 rounded-md text-sm">{block.targetModel}</span>}
                                </h3>
                              </div>
                              <p className="text-sm text-text-muted font-medium">{info.desc}</p>
                            </div>
                            <div className="flex items-center bg-background rounded-lg border border-border opacity-0 group-hover:opacity-100 transition-opacity overflow-hidden shadow-sm" data-html2canvas-ignore="true">
                              <button onClick={() => moveGraph(index, -1)} disabled={index === 0} className={`p-2 transition-colors ${index === 0 ? 'text-text-muted/30 cursor-not-allowed' : 'text-text-muted hover:text-primary hover:bg-primary/10'}`}><ChevronUp className="w-4 h-4" /></button>
                              <div className="w-px h-6 bg-border"></div>
                              <button onClick={() => moveGraph(index, 1)} disabled={index === canvasBlocks.length - 1} className={`p-2 transition-colors ${index === canvasBlocks.length - 1 ? 'text-text-muted/30 cursor-not-allowed' : 'text-text-muted hover:text-primary hover:bg-primary/10'}`}><ChevronDown className="w-4 h-4" /></button>
                              <div className="w-px h-6 bg-border"></div>
                              <button onClick={() => removeGraph(block.id)} className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"><X className="w-4 h-4" /></button>
                            </div>
                          </div>
                          <div className="h-[300px] xl:h-[340px] w-full">
                            {renderGraph(block)}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>

              <div className="mt-16 text-center text-text-muted text-sm font-semibold">
                Developed by Muzamil Hussain
              </div>

            </div>
          </main>

          {/* Floating Export Button */}
          <div className="fixed bottom-6 right-4 md:bottom-8 md:right-8 z-30" data-html2canvas-ignore="true">
            <button
              onClick={exportDashboard}
              className="flex items-center justify-center gap-2 md:gap-3 bg-text hover:bg-text/90 text-surface py-3 px-5 md:py-4 md:px-6 rounded-full font-bold shadow-2xl hover:shadow-text/30 transition-all hover:-translate-y-1"
            >
              <Download className="w-4 h-4 md:w-5 md:h-5" /> 
              <span className="text-sm md:text-base whitespace-nowrap">Export Report</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ l, v, i: Icon, c, bg }) {
  return (
    <div className="bg-surface rounded-2xl p-6 border border-border shadow-sm hover:shadow-lg transition-all hover:-translate-y-1">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-xl ${bg}`}>
          <Icon className={`w-6 h-6 ${c}`} />
        </div>
        <div>
          <p className="text-xs font-bold text-text-muted uppercase tracking-widest mb-1">{l}</p>
          <p className="text-3xl font-black tracking-tight text-text">{v}</p>
        </div>
      </div>
    </div>
  );
}

function Toast({ toast, setToast }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.9 }}
          animate={{ opacity: 1, y: 24, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.9 }}
          className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-surface border border-border text-text px-6 py-4 rounded-2xl shadow-2xl font-semibold"
        >
          <div className="p-1 bg-danger/10 text-danger rounded-full"><AlertCircle className="w-5 h-5" /></div>
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-4 p-1.5 hover:bg-background rounded-full transition-colors text-text-muted">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
