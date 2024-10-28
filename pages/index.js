import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import Papa from 'papaparse';
import axios from 'axios';
import Dropdown from 'react-bootstrap/Dropdown';
import Button from 'react-bootstrap/Button';
import Spinner from 'react-bootstrap/Spinner';
import Alert from 'react-bootstrap/Alert';
import 'bootstrap/dist/css/bootstrap.min.css';

const TIME_PERIODS = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

const StockChart = () => {
  const [stockSymbols, setStockSymbols] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('3M');
  const [currentStats, setCurrentStats] = useState(null);

  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const getChartHeight = useCallback(() => chartContainerRef.current?.clientHeight || 600, []);

  // Load CSV data
  useEffect(() => {
    const loadCSV = async () => {
      try {
        const response = await fetch('/nifty50.csv');
        const text = await response.text();
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const symbols = results.data.map((row) => row.Symbol).filter(Boolean);
            setStockSymbols(symbols);
            if (symbols.length) fetchStockData(symbols[0], selectedPeriod);
          },
          error: (err) => {
            setError(`Failed to parse CSV: ${err.message}`);
            setLoading(false);
          },
        });
      } catch (err) {
        setError(`Failed to load CSV: ${err.message}`);
        setLoading(false);
      }
    };

    loadCSV();
    return () => {
      chartInstanceRef.current?.remove();
      resizeObserverRef.current?.disconnect();
    };
  }, [selectedPeriod]);

  const fetchStockData = useCallback(async (symbol, period) => {
    setLoading(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (TIME_PERIODS.find((t) => t.label === period)?.days || 90));

      const { data } = await axios.get('/api/stockData', {
        params: { symbol, startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      });

      const formattedData = data.map((item) => ({
        time: new Date(item.time).getTime() / 1000,
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.close),
        volume: parseFloat(item.volume),
      }));

      setChartData(formattedData);

      const last = formattedData[formattedData.length - 1];
      const prev = formattedData[formattedData.length - 2];
      const change = (((last.close - prev.close) / prev.close) * 100).toFixed(2);

      setCurrentStats({
        current: last.close.toFixed(2),
        change,
        high: last.high.toFixed(2),
        low: last.low.toFixed(2),
        volume: (last.volume / 1e6).toFixed(2) + 'M',
      });
    } catch (err) {
      setError('Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: getChartHeight(),
      layout: { background: { type: 'solid', color: '#ffffff' }, textColor: '#000' },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true },
    });

    const candleSeries = chart.addCandlestickSeries();
    candleSeries.setData(chartData);

    chartInstanceRef.current = chart;
    resizeObserverRef.current = new ResizeObserver(() => chart.applyOptions({ height: getChartHeight() }));
    resizeObserverRef.current.observe(chartContainerRef.current);

    return () => chart.remove();
  }, [chartData, getChartHeight]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      fetchStockData(stockSymbols[currentIndex - 1], selectedPeriod);
    }
  };

  const handleNext = () => {
    if (currentIndex < stockSymbols.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      fetchStockData(stockSymbols[currentIndex + 1], selectedPeriod);
    }
  };

  return (
    <div className="d-flex flex-column vh-100">
      {/* Top Navbar */}
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
        <div className="container-fluid">
          <span className="navbar-brand">Stock Charts</span>
          <Dropdown>
            <Dropdown.Toggle variant="light">{selectedPeriod}</Dropdown.Toggle>
            <Dropdown.Menu>
              {TIME_PERIODS.map((p) => (
                <Dropdown.Item key={p.label} onClick={() => setSelectedPeriod(p.label)}>
                  {p.label}
                </Dropdown.Item>
              ))}
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </nav>

      {/* Main Chart Container */}
      <main className="flex-grow-1 d-flex justify-content-center align-items-center p-3">
        {loading ? (
          <Spinner animation="border" />
        ) : error ? (
          <Alert variant="danger">{error}</Alert>
        ) : (
          <div ref={chartContainerRef} className="w-100" />
        )}
      </main>

      {/* Bottom Navbar */}
      <footer className="navbar navbar-light bg-light">
        <div className="container-fluid">
          <Button onClick={handlePrevious} disabled={currentIndex === 0}>
            Previous
          </Button>
          <span>
            {currentIndex + 1} / {stockSymbols.length}
          </span>
          <Button onClick={handleNext} disabled={currentIndex === stockSymbols.length - 1}>
            Next
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default StockChart;
