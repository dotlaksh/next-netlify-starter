'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import Papa from 'papaparse';
import axios from 'axios';

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
  const [selectedPeriod, setSelectedPeriod] = useState('3M'); // Default value

  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);

  const getChartHeight = useCallback(() => {
    return window.innerWidth < 768 ? 320 : 500;
  }, []);

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
        error: (err) => setError(`Failed to parse CSV: ${err.message}`),
      });
    } catch (err) {
      setError(`Failed to load CSV: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchStockData = useCallback(async (symbol, period) => {
    setLoading(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - (TIME_PERIODS.find((t) => t.label === period)?.days || 90));

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
    } catch (err) {
      setError('Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCSV();
    return () => chartInstanceRef.current?.remove();
  }, []);

  useEffect(() => {
    if (stockSymbols.length > 0) {
      fetchStockData(stockSymbols[currentIndex], selectedPeriod);
    }
  }, [selectedPeriod, currentIndex]); // Update on period or index change

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: getChartHeight(),
      layout: { background: { type: 'solid', color: '#f8fafc' }, textColor: '#1f2937' },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true, borderColor: '#cbd5e1' },
    });

    const candleSeries = chart.addCandlestickSeries();
    candleSeries.setData(chartData);

    const volumeSeries = chart.addHistogramSeries({
      color: '#34d399',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeries.setData(chartData.map((d) => ({ time: d.time, value: d.volume })));

    chartInstanceRef.current = chart;

    return () => chart.remove();
  }, [chartData, getChartHeight]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < stockSymbols.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-blue-600 text-white py-4 px-6 flex justify-between items-center">
        <h1 className="text-lg font-semibold">Stock Charts</h1>
        <select
          className="bg-white text-gray-700 rounded px-2 py-1"
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
        >
          {TIME_PERIODS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </select>
      </header>

      {/* Chart */}
      <main className="flex-grow flex items-center justify-center p-4">
        {loading ? (
          <div className="text-center">Loading...</div>
        ) : error ? (
          <div className="text-red-500">{error}</div>
        ) : (
          <div ref={chartContainerRef} className="w-full max-w-3xl h-full shadow-lg rounded-lg bg-white" />
        )}
      </main>

      {/* Footer */}
      <footer className="sticky bottom-0 bg-white py-4 px-6 flex justify-between items-center border-t">
        <button onClick={handlePrevious} disabled={currentIndex === 0} className="text-blue-600">
          Previous
        </button>
        <span>
          {currentIndex + 1} / {stockSymbols.length}
        </span>
        <button onClick={handleNext} disabled={currentIndex === stockSymbols.length - 1} className="text-blue-600">
          Next
        </button>
      </footer>
    </div>
  );
};

export default StockChart;
