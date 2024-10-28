'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CrosshairMode, PriceScaleMode } from 'lightweight-charts';
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
  { label: 'Max', days: 3650 },
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
  const [selectedPeriod, setSelectedPeriod] = useState('YTD');
  const [selectedInterval, setSelectedInterval] = useState('daily');
  const [currentStock, setCurrentStock] = useState(null);
  const [todayChange, setTodayChange] = useState({ price: 0, percentage: 0 });

  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const legendRef = useRef(null);

  const getChartHeight = useCallback(() => {
    return window.innerWidth < 768 ? 400 : 600;
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

  const fetchTodayChange = async (symbol) => {
    try {
      // Fetch today's data
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      const { data } = await axios.get('/api/stockData', {
        params: {
          symbol,
          startDate: yesterday.toISOString(),
          endDate: today.toISOString()
        }
      });

      if (data.length >= 2) {
        const todayData = data[data.length - 1];
        const yesterdayData = data[data.length - 2];
        
        const priceChange = todayData.close - yesterdayData.close;
        const percentageChange = (priceChange / yesterdayData.close) * 100;

        setTodayChange({
          price: priceChange,
          percentage: percentageChange
        });
      }
    } catch (err) {
      console.error('Failed to fetch today\'s change:', err);
    }
  };

  // ... (keep existing aggregateData function)

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
      });

      // Fetch today's change separately
      await fetchTodayChange(symbol);
    } catch (err) {
      setError('Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateLegend = useCallback((param) => {
    if (!legendRef.current || !param) return;

    const { time, open, high, low, close, overlay } = param;
    const dateStr = new Date(time * 1000).toLocaleDateString();
    
    legendRef.current.innerHTML = `
      <div class="flex space-x-4 text-sm">
        <span>Date: ${dateStr}</span>
        <span>O: ${open?.toFixed(2)}</span>
        <span>H: ${high?.toFixed(2)}</span>
        <span>L: ${low?.toFixed(2)}</span>
        <span>C: ${close?.toFixed(2)}</span>
        ${overlay ? `<span>Vol: ${overlay.toLocaleString()}</span>` : ''}
      </div>
    `;
  }, []);

  useEffect(() => {
    loadCSV();
    return () => chartInstanceRef.current?.remove();
  }, []);

  useEffect(() => {
    if (stockSymbols.length > 0) {
      fetchStockData(stockSymbols[currentIndex], selectedPeriod, selectedInterval);
    }
  }, [selectedPeriod, selectedInterval, currentIndex]);

  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: getChartHeight(),
      layout: {
        background: { type: 'solid', color: '#f8fafc' },
        textColor: '#1f2937'
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#2962FF',
          width: 1,
          style: 1,
          labelBackgroundColor: '#2962FF',
        },
        horzLine: {
          color: '#2962FF',
          width: 1,
          style: 1,
          labelBackgroundColor: '#2962FF',
        },
      },
      grid: {
        vertLines: { color: '#e2e8f0' },
        horzLines: { color: '#e2e8f0' },
      },
      timeScale: {
        timeVisible: true,
        borderColor: '#cbd5e1',
        rightOffset: 5,
        minBarSpacing: 5,
      },
      rightPriceScale: {
        autoScale: true,
        mode: PriceScaleMode.Normal,
        borderColor: '#cbd5e1',
      },
    });

    const mainSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceLineVisible: true,
      priceLineWidth: 2,
      priceLineColor: '#2962FF',
      priceLineStyle: 2,
    });

    mainSeries.setData(chartData);

    // Add price line
    mainSeries.applyOptions({
      lastValueVisible: true,
      priceLineVisible: true,
    });

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    const volumeData = chartData.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? '#26a69a80' : '#ef535080',
    }));

    volumeSeries.setData(volumeData);

    // Subscribe to crosshair move for legend updates
    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        const data = param.seriesData.get(mainSeries);
        const volumeData = param.seriesData.get(volumeSeries);
        updateLegend({ ...data, overlay: volumeData?.value, time: param.time });
      }
    });

    chart.timeScale().fitContent();

    chartInstanceRef.current = chart;

    const handleResize = () => {
      chart.applyOptions({
        width: chartContainerRef.current.clientWidth,
        height: getChartHeight(),
      });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [chartData, getChartHeight, updateLegend]);

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <header className="sticky top-0 bg-blue-600 text-white py-4 px-6 flex justify-between items-center">
        <h1 className="text-lg font-semibold">Stock Charts</h1>
      </header>

      {currentStock && (
        <div className="flex justify-center items-center py-2 bg-white shadow-sm">
          <span className="text-lg font-bold mr-4">{currentStock.name}</span>
          <span className="text-lg font-semibold">
            {currentStock.price.toFixed(2)} (
            <span className={todayChange.percentage >= 0 ? 'text-green-500' : 'text-red-500'}>
              {todayChange.percentage >= 0 ? '+' : ''}{todayChange.percentage.toFixed(2)}%
            </span>
            )
          </span>
        </div>
      )}

      <main className="flex-grow flex flex-col items-center justify-center p-4">
        <div ref={legendRef} className="w-full max-w-3xl mb-2 p-2 bg-white rounded shadow" />
        {loading ? (
          <div className="text-center">Loading...</div>
        ) : error ? (
          <div className="text-red-500">{error}</div>
        ) : (
          <div ref={chartContainerRef} className="w-full max-w-3xl h-full shadow-lg rounded-lg bg-white" />
        )}
      </main>

      <footer className="sticky bottom-0 bg-white py-4 px-6 flex justify-between items-center border-t">
        <button 
          onClick={handlePrevious} 
          disabled={currentIndex === 0} 
          className="text-blue-600 disabled:text-gray-400"
        >
          Previous
        </button>
        <span>
          {currentIndex + 1} / {stockSymbols.length}
        </span>
        <button 
          onClick={handleNext} 
          disabled={currentIndex === stockSymbols.length - 1} 
          className="text-blue-600 disabled:text-gray-400"
        >
          Next
        </button>
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
      </footer>
    </div>
  );
};

export default StockChart;
