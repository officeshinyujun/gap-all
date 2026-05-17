import { StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
  family: 'NotoSansKR',
  fonts: [
    { src: '/fonts/NotoSansKR-Regular.otf', fontWeight: 400 },
    { src: '/fonts/NotoSansKR-Bold.otf', fontWeight: 700 },
  ],
});

Font.registerHyphenationCallback((word) => [word]);

export const styles = StyleSheet.create({
  page: {
    padding: 20,
    paddingBottom: 35,
    fontFamily: 'NotoSansKR',
    fontSize: 7,
    lineHeight: 1.4,
  },
  header: {
    textAlign: 'center',
    marginBottom: 8,
    paddingBottom: 5,
    borderBottomWidth: 1.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 2,
  },
  headerInfo: {
    fontSize: 6,
    color: '#555',
  },
  columnsContainer: {
    flexDirection: 'row',
    flex: 1,
  },
  column: {
    width: '49%',
    paddingHorizontal: 6,
  },
  columnDivider: {
    width: 0.5,
    backgroundColor: '#333',
    marginHorizontal: 2,
  },
  questionBlock: {
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    borderBottomStyle: 'solid',
  },
  questionStem: {
    fontSize: 7.5,
    fontWeight: 700,
    marginBottom: 3,
  },
  stimulusBox: {
    marginBottom: 4,
    padding: 4,
    borderWidth: 0.5,
    borderColor: '#999',
    borderStyle: 'solid',
    backgroundColor: '#fafafa',
  },
  stimulusTitle: {
    fontSize: 6.5,
    fontWeight: 700,
    marginBottom: 2,
  },
  stimulusText: {
    fontSize: 6.5,
    lineHeight: 1.3,
  },
  optionText: {
    fontSize: 7,
    marginBottom: 1.5,
    paddingLeft: 3,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    borderBottomStyle: 'solid',
  },
  tableCell: {
    flex: 1,
    padding: 3,
    fontSize: 7,
    borderRightWidth: 0.5,
    borderRightColor: '#999',
    borderRightStyle: 'solid',
  },
  tableCellHeader: {
    flex: 1,
    padding: 3,
    fontSize: 7,
    fontWeight: 700,
    borderRightWidth: 0.5,
    borderRightColor: '#999',
    borderRightStyle: 'solid',
    backgroundColor: '#eee',
  },
  answerKeyTitle: {
    fontSize: 12,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 10,
    marginTop: 20,
  },
  answerKeyRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },
  answerKeyCell: {
    width: 40,
    padding: 4,
    fontSize: 9,
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
  },
  answerKeyCellHeader: {
    width: 40,
    padding: 4,
    fontSize: 9,
    fontWeight: 700,
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    backgroundColor: '#eee',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 8,
    color: '#999',
  },
  speakerName: {
    fontSize: 8,
    fontWeight: 700,
    marginBottom: 1,
  },
  messageText: {
    fontSize: 8,
    marginBottom: 3,
    paddingLeft: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  stepLabel: {
    fontSize: 8,
    fontWeight: 700,
    marginRight: 4,
  },
  stepDesc: {
    fontSize: 8,
    flex: 1,
  },
  arrow: {
    fontSize: 8,
    textAlign: 'center',
    marginVertical: 1,
  },
});
