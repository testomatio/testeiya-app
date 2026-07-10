import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { AttachmentData } from "@/components/ai-elements/attachments";
import {
  Attachment,
  AttachmentEmpty,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";

const screenshotUrl =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5NiIgaGVpZ2h0PSI5NiI+PHJlY3Qgd2lkdGg9Ijk2IiBoZWlnaHQ9Ijk2IiBmaWxsPSIjNjM2NmYxIi8+PGNpcmNsZSBjeD0iNDgiIGN5PSI0OCIgcj0iMjQiIGZpbGw9IndoaXRlIiBvcGFjaXR5PSIwLjg1Ii8+PC9zdmc+";

const passedUrl =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5NiIgaGVpZ2h0PSI5NiI+PHJlY3Qgd2lkdGg9Ijk2IiBoZWlnaHQ9Ijk2IiBmaWxsPSIjMTZhMzRhIi8+PHBhdGggZD0iTTI4IDUwIGwxNCAxNCBsMjYtMzAiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iOCIgZmlsbD0ibm9uZSIvPjwvc3ZnPg==";

const failureScreenshot: AttachmentData = {
  id: "att-1",
  type: "file",
  mediaType: "image/svg+xml",
  filename: "checkout-failure.png",
  url: screenshotUrl,
};

const passedScreenshot: AttachmentData = {
  id: "att-2",
  type: "file",
  mediaType: "image/svg+xml",
  filename: "login-passed.png",
  url: passedUrl,
};

const traceFile: AttachmentData = {
  id: "att-3",
  type: "file",
  mediaType: "application/zip",
  filename: "trace.zip",
  url: "data:application/zip;base64,UEsDBAo=",
};

const junitReport: AttachmentData = {
  id: "att-4",
  type: "file",
  mediaType: "text/xml",
  filename: "junit-report.xml",
  url: "data:text/xml;base64,PHRlc3RzdWl0ZXMvPg==",
};

const meta = {
  title: "Agent/Attachments",
  component: Attachments,
} satisfies Meta<typeof Attachments>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {
  render: () => (
    <Attachments variant="grid">
      <Attachment data={failureScreenshot} onRemove={() => {}}>
        <AttachmentPreview />
        <AttachmentRemove />
      </Attachment>
      <Attachment data={passedScreenshot} onRemove={() => {}}>
        <AttachmentPreview />
        <AttachmentRemove />
      </Attachment>
      <Attachment data={traceFile} onRemove={() => {}}>
        <AttachmentPreview />
        <AttachmentRemove />
      </Attachment>
    </Attachments>
  ),
};

export const Inline: Story = {
  render: () => (
    <Attachments variant="inline">
      <Attachment data={failureScreenshot}>
        <AttachmentPreview />
        <AttachmentInfo />
      </Attachment>
      <Attachment data={traceFile}>
        <AttachmentPreview />
        <AttachmentInfo />
      </Attachment>
      <Attachment data={junitReport}>
        <AttachmentPreview />
        <AttachmentInfo />
      </Attachment>
    </Attachments>
  ),
};

export const List: Story = {
  render: () => (
    <Attachments variant="list" className="max-w-md">
      <Attachment data={failureScreenshot} onRemove={() => {}}>
        <AttachmentPreview />
        <AttachmentInfo showMediaType />
        <AttachmentRemove />
      </Attachment>
      <Attachment data={traceFile} onRemove={() => {}}>
        <AttachmentPreview />
        <AttachmentInfo showMediaType />
        <AttachmentRemove />
      </Attachment>
      <Attachment data={junitReport} onRemove={() => {}}>
        <AttachmentPreview />
        <AttachmentInfo showMediaType />
        <AttachmentRemove />
      </Attachment>
    </Attachments>
  ),
};

export const Empty: Story = {
  render: () => (
    <Attachments>
      <AttachmentEmpty />
    </Attachments>
  ),
};
