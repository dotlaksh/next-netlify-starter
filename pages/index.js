import { useState, useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';
import Papa from 'papaparse';
import axios from 'axios';

export default function Home() {
  const [stockSymbols, setStockSymbols] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);
  const candlestickSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  useEffect(() => {
    const loadCSV = async () => {
      try {
        const response = await fetch('/nifty50.csv');
        if (!response.ok) {
          throw new Error('Failed to load CSV file');
        }
        
        const text = await response.text();
        
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transform: (value) => value.trim(),
          complete: (results) => {
            const validData = results.data.filter(row => 
              row.Symbol && row.Symbol.trim().length > 0
            );

            if (validData.length === 0) {
              setError('No valid stock symbols found in CSV');
              setLoading(false);
              return;
            }

            const symbols = validData.map(row => row.Symbol.trim());
            setStockSymbols(symbols);
            if (symbols.length > 0) {
              fetchStockData(symbols[0]);
            }
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

  // Initialize chart only once
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartInstanceRef.current && chartContainerRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: 'solid', color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          labelVisible: false,
        },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#D1D4DC',
      },
      rightPriceScale: {
        borderColor: '#D1D4DC',
      },
    });

    // Create and store series references
    candlestickSeriesRef.current = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    volumeSeriesRef.current = chart.addHistogramSeries({
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

    // Store chart instance
    chartInstanceRef.current = chart;

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  // Update chart data separately
  useEffect(() => {
    if (chartData.length > 0 && candlestickSeriesRef.current && volumeSeriesRef.current) {
      // Update candlestick series
      candlestickSeriesRef.current.setData(chartData);

      // Update volume series
      const volumeData = chartData.map(item => ({
        time: item.time,
        value: item.volume,
        color: item.close >= item.open ? '#26a69a' : '#ef5350'
      }));
      volumeSeriesRef.current.setData(volumeData);

      // Fit content
      chartInstanceRef.current?.timeScale().fitContent();
    }
  }, [chartData]);

  const fetchStockData = async (symbol) => {
    setLoading(true);
    setError(null);
    
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 3);

      const response = await axios.get('/api/stockData', {
        params: {
          symbol,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      });

      if (response.data && response.data.length > 0) {
        setChartData(response.data);
      } else {
        setError('No data available for this symbol');
      }
    } catch (error) {
      setError(error.response?.data?.details || 'Failed to fetch stock data');
    } finally {
      setLoading(false);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      fetchStockData(stockSymbols[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (currentIndex < stockSymbols.length - 1) {
      setCurrentIndex(prev => prev + 1);
      fetchStockData(stockSymbols[currentIndex + 1]);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <nav className="bg-blue-600 text-white px-4 py-3 sm:px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="text-sm sm:text-base opacity-75">
            NSE Stock Chart
          </div>
          <h1 className="text-lg sm:text-xl font-bold truncate">
            {stockSymbols[currentIndex] || 'Loading...'}
          </h1>
        </div>
      </nav>

      <main className="flex-grow flex flex-col p-2 sm:p-4 md:p-6 overflow-hidden">
        <div className="bg-white rounded-lg shadow-lg flex-grow flex flex-col p-2 sm:p-4">
          {loading ? (
            <div className="flex-grow flex items-center justify-center">
              <div className="flex flex-col items-center space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-gray-600">Loading chart data...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-grow flex items-center justify-center">
              <div className="text-center space-y-2">
                <p className="text-red-600 text-lg">{error}</p>
                <button 
                  onClick={() => fetchStockData(stockSymbols[currentIndex])}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <div ref={chartContainerRef} className="flex-grow w-full" />
          )}
        </div>
      </main>

      <nav className="bg-white border-t shadow-lg px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0 || loading}
              className="px-3 py-2 sm:px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm sm:text-base flex items-center space-x-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Previous</span>
            </button>
            
            <span className="text-sm sm:text-base text-gray-600">
              {currentIndex + 1} / {stockSymbols.length}
            </span>
            
            <button
              onClick={handleNext}
              disabled={currentIndex === stockSymbols.length - 1 || loading}
              className="px-3 py-2 sm:px-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm sm:text-base flex items-center space-x-1"
            >
              <span className="hidden sm:inline">Next</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}
