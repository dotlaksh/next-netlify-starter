import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import Papa from 'papaparse';
import axios from 'axios';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Time period options
const TIME_PERIODS = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

export default function Home() {
  const [stockSymbols, setStockSymbols] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('3M');
  const [currentStats, setCurrentStats] = useState(null);
  
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candlestickSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  // Load CSV data
  useEffect(() => {
    const loadCSV = async () => {
      try {
        const response = await fetch('/nifty50.csv');
        if (!response.ok) throw new Error('Failed to load CSV file');
        
        const text = await response.text();
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transform: (value) => value.trim(),
          complete: (results) => {
            const validData = results.data.filter(row => row.Symbol?.trim());
            if (!validData.length) {
              setError('No valid stock symbols found in CSV');
              setLoading(false);
              return;
            }

            const symbols = validData.map(row => row.Symbol.trim());
            setStockSymbols(symbols);
            if (symbols.length > 0) fetchStockData(symbols[0], selectedPeriod);
          },
          error: (error) => {
            setError(`Failed to parse CSV file: ${error.message}`);
            setLoading(false);
          }
        });
      } catch (error) {
        setError(`Failed to load CSV file: ${error.message}`);
        setLoading(false);
      }
    };
    
    loadCSV();
  }, []);

  // Fetch stock data
  const fetchStockData = useCallback(async (symbol, period) => {
    setLoading(true);
    setError(null);
    
    try {
      const endDate = new Date();
      const startDate = new Date();
      const days = TIME_PERIODS.find(t => t.label === period)?.days || 90;
      startDate.setDate(startDate.getDate() - days);

      const response = await axios.get('/api/stockData', {
        params: { symbol, startDate: startDate.toISOString(), endDate: endDate.toISOString() }
      });

      if (response.data?.length) {
        const formattedData = response.data.map(item => ({
          time: item.time,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseFloat(item.volume)
        }));
        
        setChartData(formattedData);
        
        // Calculate current statistics
        const lastItem = formattedData[formattedData.length - 1];
        const prevItem = formattedData[formattedData.length - 2];
        const change = ((lastItem.close - prevItem.close) / prevItem.close * 100).toFixed(2);
        
        setCurrentStats({
          current: lastItem.close.toFixed(2),
          change: change,
          high: lastItem.high.toFixed(2),
          low: lastItem.low.toFixed(2),
          volume: (lastItem.volume / 1000000).toFixed(2) + 'M'
        });
      } else {
        setError('No data available for this symbol');
      }
    } catch (error) {
      setError(error.response?.data?.details || 'Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize and update chart
  useEffect(() => {
    if (!chartContainerRef.current || !chartData.length) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 600,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    // Candlestick series
    candlestickSeriesRef.current = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Volume series
    volumeSeriesRef.current = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // Set data
    candlestickSeriesRef.current.setData(chartData);
    volumeSeriesRef.current.setData(
      chartData.map(item => ({
        time: item.time,
        value: item.volume,
        color: item.close > item.open ? '#26a69a' : '#ef5350'
      }))
    );

    chart.timeScale().fitContent();
    chartInstanceRef.current = chart;

    // Resize handler
    const handleResize = () => {
      chart.applyOptions({
        width: chartContainerRef.current.clientWidth,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [chartData]);

  // Navigation handlers
  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      fetchStockData(stockSymbols[currentIndex - 1], selectedPeriod);
    }
  };

  const handleNext = () => {
    if (currentIndex < stockSymbols.length - 1) {
      setCurrentIndex(prev => prev + 1);
      fetchStockData(stockSymbols[currentIndex + 1], selectedPeriod);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white px-4 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">NSE Stock Charts</h1>
          <div className="flex items-center space-x-4">
            <Select 
              value={selectedPeriod} 
              onValueChange={(value) => {
                setSelectedPeriod(value);
                fetchStockData(stockSymbols[currentIndex], value);
              }}
            >
              <SelectTrigger className="w-24 bg-white/10">
                <SelectValue placeholder="Time Period" />
              </SelectTrigger>
              <SelectContent>
                {TIME_PERIODS.map(period => (
                  <SelectItem key={period.label} value={period.label}>
                    {period.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-4">
        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{stockSymbols[currentIndex]}</CardTitle>
            {currentStats && (
              <div className="flex items-center space-x-4 text-sm">
                <span className="font-bold">₹{currentStats.current}</span>
                <span className={currentStats.change >= 0 ? 'text-green-500' : 'text-red-500'}>
                  {currentStats.change}%
                </span>
                <span>H: ₹{currentStats.high}</span>
                <span>L: ₹{currentStats.low}</span>
                <span>Vol: {currentStats.volume}</span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-[600px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : error ? (
              <div className="text-red-500">{error}</div>
            ) : (
              <div ref={chartContainerRef} className="h-full" />
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        <div className="flex justify-between mt-4">
          <Button onClick={handlePrevious} disabled={currentIndex === 0}>
            Previous
          </Button>
          <Button onClick={handleNext} disabled={currentIndex === stockSymbols.length - 1}>
            Next
          </Button>
        </div>
      </main>
    </div>
  );
}
