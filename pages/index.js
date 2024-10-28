'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import Papa from 'papaparse';
import axios from 'axios';

const TIME_PERIODS = [
  { label: 'YTD', days: 365, auto: 'ytd' },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: '2Y', days: 730 },
  { label: '5Y', days: 1825 },
  { label: 'Max', days: 3650 }, // Approx. 10 years for max
];

const INTERVALS = [
  { label: 'Daily', value: 'daily', autoTimeframe: 'YTD' },
  { label: 'Weekly', value: 'weekly', autoTimeframe: '2Y' },
  { label: 'Monthly', value: 'monthly', autoTimeframe: '5Y' },
];

const StockChart = () => {
  const [stockSymbols, setStockSymbols] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('YTD'); // Default value adjusted
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

  const handleIntervalChange = (newInterval) => {
    const autoTimeframe = INTERVALS.find((i) => i.value === newInterval)?.autoTimeframe;
    setSelectedInterval(newInterval);
    if (autoTimeframe) {
      setSelectedPeriod(autoTimeframe);
    }
  };

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return;

    const chart = createChart(chartContainerRef.current, chartOptions);

    // Create main price chart
    const mainSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceScaleId: 'right',
    });

    // Set up the main chart data
    mainSeries.setData(chartData);

    // Create volume series in a separate pane
    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // Configure the volume pane
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.7, // Start the volume chart 70% down from the top
        bottom: 0, // Extend to the bottom
      },
      height: 100, // Fixed height for volume pane
    });

    // Set volume data with colors matching the candlesticks
    const volumeData = chartData.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? '#26a69a80' : '#ef535080',
    }));

    volumeSeries.setData(volumeData);

    // Sync crosshair movement
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
            onChange={(e) => handleIntervalChange(e.target.value)}
          >
            {INTERVALS.map((interval) => (
              <option key={interval.value} value={interval.value}>
                {interval.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      {currentStock && (
        <div className="flex justify-center items-center py-2 bg-white shadow-sm">
          <span className="text-lg font-bold mr-4">{currentStock.name}</span>
          <span className="text-lg font-semibold">
            ${currentStock.price.toFixed(2)} ({currentStock.change.toFixed(2)}%)
          </span>
        </div>
      )}

      <main className="flex-grow flex items-center justify-center p-4">
        {loading ? (
          <div className="text-center">Loading...</div>
        ) : error ? (
          <div className="text-red-500">{error}</div>
        ) : (
          <div ref={chartContainerRef} className="w-full max-w-3xl h-full shadow-lg rounded-lg bg-white" />
        )}
      </main>

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
