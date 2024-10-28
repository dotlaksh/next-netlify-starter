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

const INTERVALS = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
];

const StockChart = () => {
  const [stockSymbols, setStockSymbols] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('3M'); // Default value
  const [selectedInterval, setSelectedInterval] = useState('daily'); // Default interval
  const [currentStock, setCurrentStock] = useState(null); // Track current stock info

  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);

  const getChartHeight = useCallback(() => {
    return window.innerWidth < 768 ? 400 : 600; // Increased height
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
          if (symbols.length) fetchStockData(symbols[0], selectedPeriod, selectedInterval);
        },
        error: (err) => setError(`Failed to parse CSV: ${err.message}`),
      });
    } catch (err) {
      setError(`Failed to load CSV: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const aggregateData = (data, interval) => {
    if (interval === 'daily') return data;

    const aggregatedData = [];
    const periodMap = {};

    data.forEach((item) => {
      const date = new Date(item.time * 1000);
      let periodKey;

      if (interval === 'weekly') {
        const startOfWeek = new Date(date.setDate(date.getDate() - date.getDay()));
        periodKey = startOfWeek.toISOString().slice(0, 10);
      } else if (interval === 'monthly') {
        periodKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      }

      if (!periodMap[periodKey]) {
        periodMap[periodKey] = {
          time: item.time,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume,
        };
      } else {
        periodMap[periodKey].high = Math.max(periodMap[periodKey].high, item.high);
        periodMap[periodKey].low = Math.min(periodMap[periodKey].low, item.low);
        periodMap[periodKey].close = item.close;
        periodMap[periodKey].volume += item.volume;
      }
    });

    for (const key in periodMap) {
      aggregatedData.push(periodMap[key]);
    }

    return aggregatedData;
  };

  const fetchStockData = useCallback(async (symbol, period, interval) => {
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

      const adjustedData = aggregateData(formattedData, interval);

      setChartData(adjustedData);
      setCurrentStock({
        name: symbol,
        price: adjustedData[adjustedData.length - 1]?.close,
        change: ((adjustedData[adjustedData.length - 1]?.close - adjustedData[0]?.open) / adjustedData[0]?.open) * 100,
      });
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
      fetchStockData(stockSymbols[currentIndex], selectedPeriod, selectedInterval);
    }
  }, [selectedPeriod, selectedInterval, currentIndex]); // Update on period, interval, or index change

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: getChartHeight(),
      layout: { background: { type: 'solid', color: '#f8fafc' }, textColor: '#1f2937' },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { 
        timeVisible: true, 
        borderColor: '#cbd5e1',
        rightOffset: 5, // Added right offset
        minBarSpacing: 5, // Added minimum bar spacing
      },
      rightPriceScale: {
        autoScale: true, // Ensure autoscaling
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    candleSeries.setData(chartData);

    // Volume Series on a separate pane
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a', // Default color
      priceFormat: { type: 'volume' },
      priceScaleId: '', // Empty string ensures it creates a new pane
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // Sync volume color with candlesticks
    volumeSeries.setData(
      chartData.map((d) => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? '#26a69a' : '#ef5350',
      }))
    );

    // Ensure the chart fits content properly
    chart.timeScale().fitContent();

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
        <div className="flex items-center">
          <select
            className="bg-white text-gray-700 rounded px-2 py-1 mr-2"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            {TIME_PERIODS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            className="bg-white text-gray-700 rounded px-2 py-1"
            value={selectedInterval}
            onChange={(e) => setSelectedInterval(e.target.value)}
          >
            {INTERVALS.map((interval) => (
              <option key={interval.value} value={interval.value}>
                {interval.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Stock Info */}
      {currentStock && (
        <div className="flex justify-center items-center py-2 bg-white shadow-sm">
          <span className="text-lg font-bold mr-4">{currentStock.name}</span>
          <span className="text-lg font-semibold">
            ${currentStock.price.toFixed(2)} ({currentStock.change.toFixed(2)}%)
          </span>
        </div>
      )}

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
