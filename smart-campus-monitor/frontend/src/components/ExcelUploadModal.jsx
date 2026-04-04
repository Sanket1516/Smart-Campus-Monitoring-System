import { useState } from 'react';
import { HiOutlineX, HiOutlineUpload, HiOutlineDownload, HiOutlineCheckCircle, HiOutlineXCircle } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { uploadStudentsExcelApi } from '../services/api';

export default function ExcelUploadModal({ isOpen, onClose, onSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const ext = file.name.toLowerCase();
      if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
        toast.error('Only .xlsx and .xls files are allowed');
        e.target.value = '';
        return;
      }
      setSelectedFile(file);
      setUploadResults(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file first');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await uploadStudentsExcelApi(formData);
      const { results } = response.data;
      
      setUploadResults(results);
      
      if (results.successCount > 0) {
        toast.success(`Successfully uploaded ${results.successCount} student(s)`);
        onSuccess();
      }
      
      if (results.failureCount > 0) {
        toast.error(`${results.failureCount} row(s) failed to upload`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setUploadResults(null);
    onClose();
  };

  const downloadErrorReport = () => {
    if (!uploadResults || uploadResults.errors.length === 0) return;

    const csvContent = [
      ['Row/SAP ID', 'Name', 'Error'],
      ...uploadResults.errors.map(err => [
        err.row || err.sapId || 'N/A',
        err.name || 'N/A',
        err.error || 'Unknown error'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `upload-errors-${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadTemplate = () => {
    const templateContent = [
      ['sapId', 'name', 'email', 'category', 'course', 'department', 'year', 'phone', 'parentEmail', 'parentPhone', 'address', 'bloodGroup', 'hostel', 'roomNumber'],
      ['SAP001', 'John Doe', 'john@example.com', 'dayscholars', 'engineering', 'computer science', '2', '9876543210', 'parent@example.com', '9876543211', '123 Main St', 'O+', '', ''],
      ['SAP002', 'Jane Smith', 'jane@example.com', 'hostellers', 'pharmacy', 'bpharm', '3', '9876543212', 'parent2@example.com', '9876543213', '456 Oak Ave', 'A+', 'Girls Hostel', '201']
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([templateContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student-upload-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Template downloaded (open in Excel and save as .xlsx)');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Upload Students via Excel</h2>
            <p className="text-sm text-gray-500 mt-1">Upload .xlsx or .xls file with student data</p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 transition"
          >
            <HiOutlineX className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Download Template */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-2">Need a template?</h3>
                <p className="text-sm text-blue-700 mb-3">
                  Download our Excel template with sample data and required columns.
                </p>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  <HiOutlineDownload className="w-4 h-4" />
                  Download Template
                </button>
              </div>
            </div>
          </div>

          {/* Required Fields Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-2">Required Columns</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-gray-600">
              <div>✓ sapId</div>
              <div>✓ name</div>
              <div>✓ email</div>
              <div>✓ category (dayscholars/hostellers)</div>
              <div>✓ course</div>
              <div>✓ department</div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Optional: year, phone, parentEmail, parentPhone, address, bloodGroup, hostel, roomNumber
            </p>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Excel File
            </label>
            <div className="flex gap-3">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="flex-1 text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                disabled={uploading}
              />
              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 transition"
              >
                <HiOutlineUpload className="w-5 h-5" />
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
            {selectedFile && (
              <p className="text-sm text-gray-600 mt-2">
                Selected: <span className="font-medium">{selectedFile.name}</span>
              </p>
            )}
          </div>

          {/* Upload Results */}
          {uploadResults && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b">
                <h3 className="font-semibold text-gray-800">Upload Results</h3>
              </div>
              <div className="p-4 space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <div className="text-2xl font-bold text-gray-700">{uploadResults.totalRows}</div>
                    <div className="text-sm text-gray-500">Total Rows</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded">
                    <div className="text-2xl font-bold text-green-600 flex items-center justify-center gap-1">
                      <HiOutlineCheckCircle className="w-6 h-6" />
                      {uploadResults.successCount}
                    </div>
                    <div className="text-sm text-green-600">Successful</div>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded">
                    <div className="text-2xl font-bold text-red-600 flex items-center justify-center gap-1">
                      <HiOutlineXCircle className="w-6 h-6" />
                      {uploadResults.failureCount}
                    </div>
                    <div className="text-sm text-red-600">Failed</div>
                  </div>
                </div>

                {/* Errors */}
                {uploadResults.errors.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-red-600">
                        Errors ({uploadResults.errors.length})
                      </h4>
                      <button
                        onClick={downloadErrorReport}
                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <HiOutlineDownload className="w-4 h-4" />
                        Download Error Report
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto border rounded">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Row/SAP ID</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {uploadResults.errors.slice(0, 50).map((err, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-gray-700">{err.row || err.sapId || 'N/A'}</td>
                              <td className="px-3 py-2 text-gray-700">{err.name || 'N/A'}</td>
                              <td className="px-3 py-2 text-red-600 text-xs">{err.error}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {uploadResults.errors.length > 50 && (
                        <div className="p-2 text-center text-xs text-gray-500 bg-gray-50">
                          Showing 50 of {uploadResults.errors.length} errors. Download full report for all errors.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {uploadResults.successCount > 0 && uploadResults.failureCount === 0 && (
                  <div className="text-center py-4 text-green-600">
                    <HiOutlineCheckCircle className="w-12 h-12 mx-auto mb-2" />
                    <p className="font-medium">All students uploaded successfully!</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t px-6 py-4 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 border rounded hover:bg-gray-100 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
